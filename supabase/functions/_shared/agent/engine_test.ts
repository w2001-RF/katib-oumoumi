// Run: npx deno test --allow-env supabase/functions/_shared
// End-to-end conversation with an in-memory store, a recording channel and a
// scripted model — no network, no database.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { ChatRequest, LLM } from '../ai/types.ts';
import type { Button, Channel } from '../channels/types.ts';
import { HtmlFileRenderer } from '../docs/render.ts';
import { handleMessage, missingFields, nextBatch } from './engine.ts';
import type { AgentStore } from './store.ts';
import type { AgentDocument, AgentUser, CatalogEntry, Conversation, IncomingMessage, TemplateField } from './types.ts';

const field = (key: string, type: TemplateField['field_type'], sort: number, required = true, options: string[] = []): TemplateField => ({
  field_id: `id-${key}`, field_key: key, label_ar: key, field_type: type, placeholder_ar: '', is_required: required, sort_order: sort, options,
});

const DOC: AgentDocument = {
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

class MemoryStore implements AgentStore {
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

class RecordingChannel implements Channel {
  readonly name = 'telegram' as const;
  texts: { text: string; buttons?: Button[][] }[] = [];
  files: { filename: string; mime: string; data: Uint8Array }[] = [];
  sendText(_chatId: string, text: string, buttons?: Button[][]) {
    this.texts.push({ text, buttons });
    return Promise.resolve();
  }
  sendVoice() { return Promise.resolve(); }
  sendDocument(_chatId: string, file: { data: Uint8Array; filename: string; mime: string }) {
    this.files.push(file);
    return Promise.resolve();
  }
  showActivity() { return Promise.resolve(); }
}

// Answers each task by the JSON schema name it is asked for.
class ScriptedLLM implements LLM {
  readonly name = 'scripted';
  readonly caps = { tools: false, json: 'none' as const, vision: false, audioInput: false };
  calls: string[] = [];
  constructor(private readonly answers: Record<string, unknown[]>) {}
  chat(): Promise<string> { return Promise.resolve(''); }
  json<T>(_req: ChatRequest, _schema: unknown, name: string): Promise<T> {
    this.calls.push(name);
    const queue = this.answers[name] ?? [];
    if (!queue.length) throw new Error(`no scripted answer for ${name}`);
    return Promise.resolve(queue.shift() as T);
  }
}

let update = 0;
const msg = (extra: Partial<IncomingMessage>): IncomingMessage => ({
  channel: 'telegram', externalUserId: '42', chatId: '42', displayName: 'Fatima', updateId: ++update, ...extra,
});

Deno.test('full conversation: consent → document → questions → validation → confirm → file', async () => {
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const llm = new ScriptedLLM({
    intent: [{ document: 'd2', confidence: 0.9, candidates: ['d2'] }],
    // f1 city, f2 name, f3 cin, f4 details, f5 email (optional)
    extraction: [
      { values: [{ id: 'f1', value: 'سطات' }, { id: 'f4', value: 'الجار كيدير الصداع كل ليلة' }], skipped: [] },
      { values: [{ id: 'f1', value: 'فاطمة الزهراء' }, { id: 'f2', value: '754103' }], skipped: [] }, // f1 now = name (city filled), f2 = cin
      { values: [{ id: 'f1', value: 'g 754 103' }], skipped: [] },
      { values: [], skipped: ['f1'] }, // declines the email
    ],
    rewrite: [{ formal_ar: 'يقوم الجار بإحداث ضجيج كل ليلة.', darija_summary: 'الجار كيدير الصداع كل ليلة' }],
    question: [{ text: 'شنو سميتك ورقم البطاقة؟' }, { text: 'رقم البطاقة ماشي صحيح، بحال G754103' }, { text: 'عندك إيميل؟' }],
  });
  const deps = { store, channel, llm: () => llm, stt: null, tts: null, renderer: new HtmlFileRenderer(), today: () => '2026-10-15' };

  await handleMessage(deps, msg({ text: 'السلام' }));
  assertStringIncludes(channel.texts.at(-1)!.text, 'واش موافق');
  assertEquals(llm.calls, [], 'no AI call before consent');

  await handleMessage(deps, msg({ action: 'consent:yes' }));
  await handleMessage(deps, msg({ text: 'الجار ديالي فسطات كيدير الصداع كل ليلة' }));
  assertStringIncludes(channel.texts.at(-1)!.text, 'شنو سميتك');

  await handleMessage(deps, msg({ text: 'فاطمة الزهراء، 754103' }));
  assertStringIncludes(channel.texts.at(-1)!.text, 'G754103', 'invalid CIN is asked again');

  await handleMessage(deps, msg({ text: 'g 754 103' }));
  assertStringIncludes(channel.texts.at(-1)!.text, 'إيميل');

  await handleMessage(deps, msg({ text: 'ما عنديش' }));
  const summary = channel.texts.at(-1)!;
  assertStringIncludes(summary.text, 'G754103');
  assertStringIncludes(summary.text, 'يقوم الجار بإحداث ضجيج');
  assertEquals(summary.buttons?.[0][0].action, 'confirm:yes');

  await handleMessage(deps, msg({ action: 'confirm:yes' }));
  assertEquals(channel.files.length, 1);
  const html = new TextDecoder().decode(channel.files[0].data);
  assertStringIncludes(html, 'فاطمة الزهراء — G754103 — سطات — يقوم الجار بإحداث ضجيج كل ليلة.');
  assertEquals(store.logged.length, 1);
  assertEquals(store.profiles.get('telegram:42'), { full_name: 'فاطمة الزهراء', cin: 'G754103' });
});

Deno.test('webhook retries are ignored', async () => {
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const deps = { store, channel, llm: () => new ScriptedLLM({}), stt: null, tts: null, renderer: new HtmlFileRenderer() };
  const m = msg({ text: '/help' });
  await handleMessage(deps, m);
  await handleMessage(deps, m);
  assertEquals(channel.texts.length, 1);
});

Deno.test('saved profile prefills only the fields that describe the user', async () => {
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const llm = new ScriptedLLM({ question: [{ text: 'فين كاين المشكل؟' }] });
  const deps = { store, channel, llm: () => llm, stt: null, tts: null, renderer: new HtmlFileRenderer() };
  const user = await store.upsertUser('telegram', '42', '');
  await store.setConsent(user.id);
  store.profiles.set(user.id, { full_name: 'فاطمة', cin: 'G754103', phone: '0612345678' });
  await store.createConversation(user.id);
  store.convs[0].candidate_ids = [DOC.id];

  await handleMessage(deps, msg({ text: '1' }));
  const conv = store.convs[0];
  assertEquals(conv.field_values, { 'اسم مقدم الشكاية': 'فاطمة', 'رقم البطاقة الوطنية': 'G754103' });
  assert(!llm.calls.includes('extraction'), 'a bare menu number is not sent for extraction');
});

Deno.test('question batching: one per message for voice users, never a long text with others', () => {
  const conv = { field_values: {}, skipped_keys: [] } as unknown as Conversation;
  const missing = missingFields(DOC, conv);
  assertEquals(missing.at(-1)!.field_key, 'البريد الإلكتروني', 'optional fields come last');
  assertEquals(nextBatch(missing, {}, true).length, 1);
  assertEquals(nextBatch(missing, {}, false).map((f) => f.field_key), ['المدينة', 'اسم مقدم الشكاية', 'رقم البطاقة الوطنية']);
  assertEquals(nextBatch(missing, { 'رقم البطاقة الوطنية': 'x' }, false)[0].field_key, 'رقم البطاقة الوطنية', 'rejected first');
});
