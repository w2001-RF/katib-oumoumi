// Run: npx deno test --allow-env supabase/functions/_shared
import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
// @ts-types="../../../../tests/support/fakeSupabase.d.ts"
import { argsOf, createFakeClient, kind } from '../../../../tests/support/fakeSupabase.js';
import { SupabaseAgentStore } from './store.ts';
import type { Conversation } from './types.ts';

type Call = { table: string | null; rpc?: string; args?: unknown; ops: unknown[][] };
const ok = (data: unknown) => ({ data, error: null });

function storeWith(handler: (call: Call) => unknown) {
  const db = createFakeClient(handler);
  return { db, store: new SupabaseAgentStore(db as unknown as SupabaseClient) };
}

Deno.test('constructor needs the service role env when no client is given', () => {
  const saved = Deno.env.get('SUPABASE_URL');
  Deno.env.delete('SUPABASE_URL');
  try {
    assertThrows(() => new SupabaseAgentStore(), Error, 'SUPABASE_URL');
  } finally {
    if (saved) Deno.env.set('SUPABASE_URL', saved);
  }
});

Deno.test('users: upsert, update claim, consent, voice preference', async () => {
  let claimRows: unknown[] = [{ id: 'u1' }];
  const { db, store } = storeWith((call) => {
    if (kind(call) === 'upsert') return ok({ id: 'u1', consent_at: null });
    if (kind(call) === 'update' && argsOf(call, 'or')) return ok(claimRows);
    return ok(null);
  });
  assertEquals((await store.upsertUser('telegram', '42', 'Fatima')).id, 'u1');
  assertEquals(argsOf(db.calls[0], 'upsert')[1], { onConflict: 'channel,external_id' });
  assertEquals(await store.claimUpdate('u1', 7), true);
  assertEquals(argsOf(db.calls.at(-1), 'or'), ['last_update_id.is.null,last_update_id.lt.7']);
  claimRows = [];
  assertEquals(await store.claimUpdate('u1', 7), false);
  await store.setConsent('u1');
  await store.setPrefersVoice('u1', true);
  assertEquals(argsOf(db.calls.at(-1), 'update'), [{ prefers_voice: true }]);
});

Deno.test('conversations: active, create, save, cancel', async () => {
  const conv: Conversation = { id: 'c1', user_id: 'u1', status: 'collecting', document_type_id: 'd', candidate_ids: [], field_values: { a: '1' },
    field_summaries: {}, skipped_keys: [], asked_keys: [] };
  let active: unknown[] = [conv];
  const { db, store } = storeWith((call) => {
    if (kind(call) === 'insert') return ok(conv);
    if (kind(call) === 'select') return ok(active);
    return ok(null);
  });
  assertEquals(await store.getActiveConversation('u1'), conv);
  active = [];
  assertEquals(await store.getActiveConversation('u1'), null);
  assertEquals((await store.createConversation('u1')).id, 'c1');
  await store.saveConversation(conv);
  const saved = argsOf(db.calls.at(-1), 'update')[0];
  assertEquals(saved.field_values, { a: '1' });
  assertEquals('user_id' in saved || 'id' in saved, false, 'ids are never rewritten');
  await store.cancelConversations('u1');
  assertEquals(argsOf(db.calls.at(-1), 'update'), [{ status: 'cancelled' }]);
});

Deno.test('forget, profile read/write', async () => {
  let profileRows: unknown[] = [{ data: { cin: 'G1' } }];
  const { db, store } = storeWith((call) => (kind(call) === 'select' ? ok(profileRows) : ok(null)));
  await store.forgetUser('u1');
  assertEquals(db.calls.map((c: Call) => `${kind(c)}:${c.table}`), [
    'delete:agent_user_profiles', 'delete:agent_conversations', 'update:agent_channel_users', 'update:agent_turns',
  ]);
  assertEquals(argsOf(db.calls.at(-1), 'update'), [{ user_id: null }]);
  // Before migration 003 the telemetry table is missing: /forget still works.
  db.reset((call: Call) => (call.table === 'agent_turns' ? { data: null, error: { message: 'relation does not exist' } } : ok(null)));
  await store.forgetUser('u1');
  db.reset((call: Call) => (kind(call) === 'select' ? ok(profileRows) : ok(null)));
  assertEquals(await store.getProfile('u1'), { cin: 'G1' });
  profileRows = [];
  assertEquals(await store.getProfile('u1'), {});
  await store.saveProfile('u1', { cin: 'G2' });
  assertEquals(argsOf(db.calls.at(-1), 'upsert')[0].data, { cin: 'G2' });
});

Deno.test('catalog joins keywords from the hints table', async () => {
  const { store } = storeWith((call) =>
    call.table === 'document_types'
      ? ok([{ id: 'd1', name_ar: 'شكاية', description_ar: '' }, { id: 'd2', name_ar: 'عقد', description_ar: '' }])
      : ok([{ document_type_id: 'd1', keywords: 'الجار' }]));
  assertEquals(await store.listCatalog(), [
    { id: 'd1', name_ar: 'شكاية', description_ar: '', keywords: 'الجار' },
    { id: 'd2', name_ar: 'عقد', description_ar: '', keywords: '' },
  ]);
});

Deno.test('getDocument assembles template, fields, prompts and hints', async () => {
  const tables: Record<string, unknown> = {
    document_types: [{ id: 'd1', name_ar: 'شكاية', template_body: '<p/>' }],
    v_template_fields: [{ field_id: 'f1', field_key: 'k', options: null }],
    agent_document_hints: [{ next_steps_ar: 'اطبع', self_fields: { cin: 'k' } }],
    agent_field_hints: [{ field_id: 'f1', ask_prompt: 'عطيني' }],
  };
  const { store } = storeWith((call) => ok(tables[call.table!]));
  const doc = await store.getDocument('d1');
  assertEquals(doc?.fields[0] as unknown, { field_id: 'f1', field_key: 'k', options: [], ask_prompt: 'عطيني' });
  assertEquals([doc?.next_steps_ar, doc?.self_fields], ['اطبع', { cin: 'k' }]);

  tables.v_template_fields = [];
  tables.agent_document_hints = [];
  const bare = await store.getDocument('d1');
  assertEquals([bare?.fields, bare?.next_steps_ar, bare?.self_fields], [[], '', {}]);

  tables.document_types = [];
  assertEquals(await store.getDocument('d1'), null);
});

Deno.test('logGenerated writes like the web app and tolerates a failing counter', async () => {
  const { db, store } = storeWith((call) => (call.rpc ? { data: null, error: { message: 'down' } } : ok(null)));
  await store.logGenerated('d1', 'agent:telegram:u1', { k: 'v' });
  assertEquals(argsOf(db.calls[0], 'insert')[0], { document_type_id: 'd1', session_id: 'agent:telegram:u1', data: { k: 'v' } });
  assertEquals(db.calls[1].rpc, 'increment_document_usage');
});

Deno.test('database errors are raised', async () => {
  const { store } = storeWith(() => ({ data: null, error: { message: 'permission denied' } }));
  await assertRejects(() => store.getProfile('u1'), Error, 'permission denied');
});

Deno.test('memory: history is saved; a new conversation prunes the user\'s old ones first', async () => {
  const conv: Conversation = { id: 'c1', user_id: 'u1', status: 'collecting', document_type_id: 'd', candidate_ids: [], field_values: {},
    field_summaries: {}, skipped_keys: [], asked_keys: [], history: [{ role: 'user', text: 'سلام' }] };
  const { db, store } = storeWith((call) => (kind(call) === 'insert' ? ok(conv) : ok(null)));
  store.now = () => Date.parse('2026-10-17T00:00:00Z');
  await store.createConversation('u1');
  assertEquals(db.calls.map((c: Call) => `${kind(c)}:${c.table}`), ['delete:agent_conversations', 'insert:agent_conversations']);
  assertEquals(argsOf(db.calls[0], 'eq'), ['user_id', 'u1']);
  assertEquals(argsOf(db.calls[0], 'lt'), ['updated_at', '2026-09-17T00:00:00.000Z'], '30 days of retention');
  await store.saveConversation(conv);
  assertEquals(argsOf(db.calls.at(-1), 'update')[0].history, [{ role: 'user', text: 'سلام' }]);
  await store.saveConversation({ ...conv, history: undefined });
  assertEquals(argsOf(db.calls.at(-1), 'update')[0].history, [], 'rows written before migration 004 get an empty history');

  // A failing prune (e.g. a transient error) does not block the conversation.
  db.reset((call: Call) => (kind(call) === 'delete' ? { data: null, error: { message: 'timeout' } } : ok(conv)));
  assertEquals((await store.createConversation('u1')).id, 'c1');
});

Deno.test('settings: read once a minute, kept on errors', async () => {
  let rows: unknown[] = [{ value: 'كن لطيفاً' }];
  let fail = false;
  const { db, store } = storeWith(() => (fail ? { data: null, error: { message: 'down' } } : ok(rows)));
  let now = 0;
  store.now = () => now;
  assertEquals(await store.getSetting('system_prompt'), 'كن لطيفاً');
  assertEquals(argsOf(db.calls[0], 'eq'), ['key', 'system_prompt']);
  rows = [{ value: 'جديد' }];
  now = 30_000;
  assertEquals(await store.getSetting('system_prompt'), 'كن لطيفاً', 'cached');
  assertEquals(db.calls.length, 1);
  now = 61_000;
  assertEquals(await store.getSetting('system_prompt'), 'جديد', 'refreshed after a minute');
  fail = true;
  now = 200_000;
  assertEquals(await store.getSetting('system_prompt'), 'جديد', 'last known value on errors');
  assertEquals(await store.getSetting('other'), '', 'unknown and unreadable: empty');
  fail = false;
  rows = [];
  assertEquals(await store.getSetting('missing'), '');
});
