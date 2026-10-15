// Test doubles for the agent: an in-memory store, a recording channel and a
// scripted model. Shared by the engine tests.

import type { ChatRequest, LLM, ModelCapabilities, SpeechToText, TextToSpeech } from '../ai/types.ts';
import type { Button, Channel } from '../channels/types.ts';
import type { AgentStore } from '../agent/store.ts';
import type { AgentDocument, AgentUser, CatalogEntry, Conversation, IncomingMessage, TemplateField } from '../agent/types.ts';

export const field = (key: string, type: TemplateField['field_type'], sort: number, required = true, options: string[] = []): TemplateField => ({
  field_id: `id-${key}`, field_key: key, label_ar: key, field_type: type, placeholder_ar: '', is_required: required, sort_order: sort, options,
});

export const DOC: AgentDocument = {
  id: 'doc-neighbour',
  name_ar: 'شكاية بسبب الجار',
  template_body: '<p>{{اسم مقدم الشكاية}} — {{رقم البطاقة الوطنية}} — {{المدينة}} — {{تفاصيل الشكاية}} — {{البريد الإلكتروني}}</p>',
  fields: [
    field('المدينة', 'select', 1, true, ['سطات', 'الدار البيضاء']),
    field('اسم مقدم الشكاية', 'varchar', 2),
    field('رقم البطاقة الوطنية', 'cin', 3),
    field('تفاصيل الشكاية', 'text', 4),
    field('البريد الإلكتروني', 'email', 5, false),
  ],
  next_steps_ar: 'ضعها لدى السلطة المحلية.',
  self_fields: { full_name: 'اسم مقدم الشكاية', cin: 'رقم البطاقة الوطنية' },
};

export class MemoryStore implements AgentStore {
  users = new Map<string, AgentUser & { last?: number }>();
  convs: Conversation[] = [];
  profiles = new Map<string, Record<string, string>>();
  logged: Record<string, string>[] = [];

  upsertUser(channel: string, externalId: string, displayName: string) {
    const id = `${channel}:${externalId}`;
    if (!this.users.has(id)) this.users.set(id, { id, channel, external_id: externalId, display_name: displayName, prefers_voice: false, consent_at: null });
    return Promise.resolve({ ...this.users.get(id)! });
  }
  claimUpdate(userId: string, updateId: number) {
    const u = this.users.get(userId)!;
    if (u.last !== undefined && u.last >= updateId) return Promise.resolve(false);
    u.last = updateId;
    return Promise.resolve(true);
  }
  setConsent(userId: string) {
    this.users.get(userId)!.consent_at = new Date().toISOString();
    return Promise.resolve();
  }
  setPrefersVoice(userId: string, value: boolean) {
    this.users.get(userId)!.prefers_voice = value;
    return Promise.resolve();
  }
  getActiveConversation(userId: string) {
    const c = this.convs.find((x) => x.user_id === userId && ['choosing', 'collecting', 'confirming'].includes(x.status));
    return Promise.resolve(c ? structuredClone(c) : null);
  }
  createConversation(userId: string) {
    const c: Conversation = {
      id: `c${this.convs.length + 1}`, user_id: userId, status: 'choosing', document_type_id: null, candidate_ids: [],
      field_values: {}, field_summaries: {}, skipped_keys: [], asked_keys: [],
    };
    this.convs.push(c);
    return Promise.resolve(structuredClone(c));
  }
  saveConversation(conv: Conversation) {
    this.convs = this.convs.map((c) => (c.id === conv.id ? structuredClone(conv) : c));
    return Promise.resolve();
  }
  cancelConversations(userId: string) {
    this.convs.forEach((c) => { if (c.user_id === userId) c.status = 'cancelled'; });
    return Promise.resolve();
  }
  forgetUser(userId: string) {
    this.profiles.delete(userId);
    this.convs = this.convs.filter((c) => c.user_id !== userId);
    this.users.get(userId)!.consent_at = null;
    return Promise.resolve();
  }
  getProfile(userId: string) {
    return Promise.resolve({ ...(this.profiles.get(userId) ?? {}) });
  }
  saveProfile(userId: string, data: Record<string, string>) {
    this.profiles.set(userId, data);
    return Promise.resolve();
  }
  listCatalog(): Promise<CatalogEntry[]> {
    return Promise.resolve([
      { id: 'doc-admin', name_ar: 'شكاية إدارية', description_ar: '', keywords: '' },
      { id: DOC.id, name_ar: DOC.name_ar, description_ar: '', keywords: 'الجار' },
    ]);
  }
  getDocument(id: string) {
    return Promise.resolve(id === DOC.id ? DOC : null);
  }
  logGenerated(_id: string, _session: string, values: Record<string, string>) {
    this.logged.push(values);
    return Promise.resolve();
  }
}

export class RecordingChannel implements Channel {
  readonly name = 'telegram' as const;
  texts: { text: string; buttons?: Button[][] }[] = [];
  files: { filename: string; mime: string; data: Uint8Array }[] = [];
  sendText(_chatId: string, text: string, buttons?: Button[][]) {
    this.texts.push({ text, buttons });
    return Promise.resolve();
  }
  voices: { data: Uint8Array; mime: string; voice: boolean }[] = [];
  sendVoice(_chatId: string, audio: { data: Uint8Array; mime: string; voice: boolean }) {
    this.voices.push(audio);
    return Promise.resolve();
  }
  sendDocument(_chatId: string, file: { data: Uint8Array; filename: string; mime: string }) {
    this.files.push(file);
    return Promise.resolve();
  }
  showActivity() { return Promise.resolve(); }
}

// Answers each task by the JSON schema name it is asked for.
export class ScriptedLLM implements LLM {
  readonly name = 'scripted';
  readonly caps: ModelCapabilities;
  calls: string[] = [];
  requests: ChatRequest[] = [];
  constructor(private readonly answers: Record<string, unknown[]>, caps: Partial<ModelCapabilities> = {}) {
    this.caps = { tools: false, json: 'none', vision: false, audioInput: false, ...caps };
  }
  chat(): Promise<string> { return Promise.resolve(''); }
  json<T>(req: ChatRequest, _schema: unknown, name: string): Promise<T> {
    this.calls.push(name);
    this.requests.push(req);
    const queue = this.answers[name] ?? [];
    if (!queue.length) throw new Error(`no scripted answer for ${name}`);
    return Promise.resolve(queue.shift() as T);
  }
}

let update = 0;
export const msg = (extra: Partial<IncomingMessage>): IncomingMessage => ({
  channel: 'telegram', externalUserId: '42', chatId: '42', displayName: 'Fatima', updateId: ++update, ...extra,
});

export class FakeSTT implements SpeechToText {
  constructor(private readonly transcript: string) {}
  transcribe(): Promise<string> { return Promise.resolve(this.transcript); }
}

export class FakeTTS implements TextToSpeech {
  spoken: string[] = [];
  constructor(private readonly fail = false) {}
  speak(text: string) {
    this.spoken.push(text);
    if (this.fail) return Promise.reject(new Error('tts down'));
    return Promise.resolve({ data: new Uint8Array([1]), mime: 'audio/ogg', voice: true });
  }
}
