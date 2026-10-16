// Persistence used by the agent. The engine only sees the AgentStore
// interface; tests use an in-memory one (see engine_test.ts).
//
// Existing tables are only READ (document_types, v_template_fields) or
// written exactly the way the web app already writes them
// (generated_documents insert, increment_document_usage RPC).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { AgentDocument, AgentUser, CatalogEntry, Conversation, TemplateField } from './types.ts';

export interface AgentStore {
  upsertUser(channel: string, externalId: string, displayName: string): Promise<AgentUser>;
  /** False when this update was already handled (webhook retry). */
  claimUpdate(userId: string, updateId: number): Promise<boolean>;
  setConsent(userId: string): Promise<void>;
  setPrefersVoice(userId: string, value: boolean): Promise<void>;
  getActiveConversation(userId: string): Promise<Conversation | null>;
  createConversation(userId: string): Promise<Conversation>;
  saveConversation(conv: Conversation): Promise<void>;
  cancelConversations(userId: string): Promise<void>;
  /** Deletes the profile and conversations and withdraws consent. */
  forgetUser(userId: string): Promise<void>;
  getProfile(userId: string): Promise<Record<string, string>>;
  saveProfile(userId: string, data: Record<string, string>): Promise<void>;
  listCatalog(): Promise<CatalogEntry[]>;
  getDocument(id: string): Promise<AgentDocument | null>;
  logGenerated(documentTypeId: string, sessionId: string, values: Record<string, string>): Promise<void>;
}

const ACTIVE_STATUSES = ['choosing', 'collecting', 'confirming'];
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;
const CONV_COLUMNS = 'id, user_id, status, document_type_id, candidate_ids, field_values, field_summaries, skipped_keys, asked_keys';

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as NonNullable<T>; // writes without .select() return null data
}

export class SupabaseAgentStore implements AgentStore {
  private readonly db: SupabaseClient;

  /** `client` is for tests; by default it connects with the function's service role key. */
  constructor(client?: SupabaseClient) {
    if (client) {
      this.db = client;
      return;
    }
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async upsertUser(channel: string, externalId: string, displayName: string): Promise<AgentUser> {
    return check(
      await this.db
        .from('agent_channel_users')
        .upsert({ channel, external_id: externalId, display_name: displayName }, { onConflict: 'channel,external_id' })
        .select('id, channel, external_id, display_name, prefers_voice, consent_at')
        .single(),
    );
  }

  async claimUpdate(userId: string, updateId: number): Promise<boolean> {
    const rows = check(
      await this.db
        .from('agent_channel_users')
        .update({ last_update_id: updateId })
        .eq('id', userId)
        .or(`last_update_id.is.null,last_update_id.lt.${updateId}`)
        .select('id'),
    );
    return rows.length > 0;
  }

  async setConsent(userId: string) {
    check(await this.db.from('agent_channel_users').update({ consent_at: new Date().toISOString() }).eq('id', userId));
  }

  async setPrefersVoice(userId: string, value: boolean) {
    check(await this.db.from('agent_channel_users').update({ prefers_voice: value }).eq('id', userId));
  }

  async getActiveConversation(userId: string): Promise<Conversation | null> {
    const since = new Date(Date.now() - CONVERSATION_TTL_MS).toISOString();
    const rows = check(
      await this.db
        .from('agent_conversations')
        .select(CONV_COLUMNS)
        .eq('user_id', userId)
        .in('status', ACTIVE_STATUSES)
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(1),
    );
    return (rows[0] as Conversation) ?? null;
  }

  async createConversation(userId: string): Promise<Conversation> {
    return check(await this.db.from('agent_conversations').insert({ user_id: userId }).select(CONV_COLUMNS).single()) as Conversation;
  }

  async saveConversation(conv: Conversation) {
    const changes = {
      status: conv.status,
      document_type_id: conv.document_type_id,
      candidate_ids: conv.candidate_ids,
      field_values: conv.field_values,
      field_summaries: conv.field_summaries,
      skipped_keys: conv.skipped_keys,
      asked_keys: conv.asked_keys,
      updated_at: new Date().toISOString(),
    };
    check(await this.db.from('agent_conversations').update(changes).eq('id', conv.id));
  }

  async cancelConversations(userId: string) {
    check(
      await this.db.from('agent_conversations').update({ status: 'cancelled' }).eq('user_id', userId).in('status', ACTIVE_STATUSES),
    );
  }

  async forgetUser(userId: string) {
    check(await this.db.from('agent_user_profiles').delete().eq('user_id', userId));
    check(await this.db.from('agent_conversations').delete().eq('user_id', userId));
    check(await this.db.from('agent_channel_users').update({ consent_at: null, prefers_voice: false }).eq('id', userId));
    // Dashboard telemetry keeps no content, but unlink it from the user too.
    // Best effort: the table exists only once migration 003 is applied.
    const { error } = await this.db.from('agent_turns').update({ user_id: null }).eq('user_id', userId);
    if (error) console.warn('[agent] could not unlink telemetry', error.message);
  }

  async getProfile(userId: string): Promise<Record<string, string>> {
    const rows = check(await this.db.from('agent_user_profiles').select('data').eq('user_id', userId).limit(1));
    return (rows[0]?.data as Record<string, string>) ?? {};
  }

  async saveProfile(userId: string, data: Record<string, string>) {
    check(
      await this.db
        .from('agent_user_profiles')
        .upsert({ user_id: userId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
    );
  }

  async listCatalog(): Promise<CatalogEntry[]> {
    const [docs, hints] = await Promise.all([
      this.db.from('document_types').select('id, name_ar, description_ar').eq('is_published', true).order('usage_count', { ascending: false }),
      this.db.from('agent_document_hints').select('document_type_id, keywords'),
    ]);
    const keywords = new Map(check(hints).map((h) => [h.document_type_id as string, h.keywords as string]));
    return check(docs).map((d) => ({ ...(d as Omit<CatalogEntry, 'keywords'>), keywords: keywords.get(d.id) ?? '' }));
  }

  async getDocument(id: string): Promise<AgentDocument | null> {
    const [doc, fields, hint] = await Promise.all([
      this.db.from('document_types').select('id, name_ar, template_body').eq('id', id).eq('is_published', true).limit(1),
      this.db.from('v_template_fields').select('*').eq('document_type_id', id).order('sort_order', { ascending: true }),
      this.db.from('agent_document_hints').select('next_steps_ar, self_fields').eq('document_type_id', id).limit(1),
    ]);
    const row = check(doc)[0];
    if (!row) return null;
    const fieldRows = check(fields) as TemplateField[];
    const prompts = fieldRows.length
      ? check(await this.db.from('agent_field_hints').select('field_id, ask_prompt').in('field_id', fieldRows.map((f) => f.field_id)))
      : [];
    const promptById = new Map(prompts.map((p) => [p.field_id as string, p.ask_prompt as string]));
    const h = check(hint)[0];
    return {
      ...(row as { id: string; name_ar: string; template_body: string }),
      fields: fieldRows.map((f) => ({ ...f, options: Array.isArray(f.options) ? f.options : [], ask_prompt: promptById.get(f.field_id) || '' })),
      next_steps_ar: h?.next_steps_ar ?? '',
      self_fields: (h?.self_fields as Record<string, string>) ?? {},
    };
  }

  async logGenerated(documentTypeId: string, sessionId: string, values: Record<string, string>) {
    // Same row shape and RPC as the web app (js/api.js), so bot documents show in the admin stats.
    check(await this.db.from('generated_documents').insert({ document_type_id: documentTypeId, session_id: sessionId, data: values }));
    const { error } = await this.db.rpc('increment_document_usage', { doc_id: documentTypeId });
    if (error) console.warn('increment_document_usage failed', error.message);
  }
}
