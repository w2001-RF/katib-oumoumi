// Commands (/status, /documents, /skip, /edit, /mydata, /privacy...),
// conversation memory and the admin's system prompt.
// Run: npx deno test --allow-env supabase/functions/_shared
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { ChatRequest, LLM } from '../ai/types.ts';
import { HtmlFileRenderer } from '../docs/render.ts';
import { DOC, MemoryStore, msg, RecordingChannel, ScriptedLLM } from '../testing/agentFakes.ts';
import { type AgentDeps, handleMessage } from './engine.ts';
import { BOT_COMMANDS, MSG, parseCommand } from './messages.ts';
import type { Conversation } from './types.ts';

async function setup(llm: LLM = new ScriptedLLM({}), extra: Partial<AgentDeps> = {}, consent = true) {
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const user = await store.upsertUser('telegram', '42', 'Fatima');
  if (consent) await store.setConsent(user.id);
  const deps: AgentDeps = { store, channel, llm: () => llm, stt: null, tts: null, renderer: new HtmlFileRenderer(), today: () => '2026-10-17', ...extra };
  const send = (m: Parameters<typeof msg>[0]) => handleMessage(deps, msg(m));
  const last = () => channel.texts.at(-1)?.text ?? '';
  return { store, channel, user, deps, send, last };
}

function startIn(store: MemoryStore, userId: string, status: Conversation['status'], values: Record<string, string> = {}, asked: string[] = []) {
  store.convs.push({
    id: 'c1', user_id: userId, status, document_type_id: DOC.id, candidate_ids: [],
    field_values: values, field_summaries: {}, skipped_keys: [], asked_keys: asked, history: [],
  });
}

const systemOf = (req: ChatRequest) => String(req.messages[0].content);
const ALL_REQUIRED = { 'المدينة': 'سطات', 'اسم مقدم الشكاية': 'فاطمة', 'رقم البطاقة الوطنية': 'G754103', 'تفاصيل الشكاية': 'وقائع' };

Deno.test('parseCommand: single commands, case and @bot suffix', () => {
  assertEquals(parseCommand('/Help@KatibOumoumiBot'), 'help');
  assertEquals(parseCommand(' /status '), 'status');
  assertEquals([parseCommand('/help me'), parseCommand('help'), parseCommand('/123')], [null, null, null]);
  for (const c of BOT_COMMANDS) assert(MSG.help.includes(`/${c.command}`), `/help lists /${c.command}`);
});

Deno.test('before consent: /privacy, /mydata, /help answer without the model', async () => {
  const llm = new ScriptedLLM({});
  const { send, last } = await setup(llm, {}, false);
  await send({ text: '/privacy' });
  assertStringIncludes(last(), '/forget');
  assertStringIncludes(last(), '30 يوم');
  await send({ text: '/mydata' });
  assertEquals(last(), MSG.mydataEmpty);
  await send({ text: '/help@KatibOumoumiBot' });
  assertEquals(last(), MSG.help);
  await send({ text: '/status' });
  assertStringIncludes(last(), MSG.consentNeeded, 'document commands wait for consent');
  assertEquals(llm.calls, []);
});

Deno.test('/mydata: saved profile and the document in progress', async () => {
  const { store, user, send, last } = await setup();
  store.profiles.set(user.id, { full_name: 'فاطمة', cin: 'G754103', note: '' });
  startIn(store, user.id, 'collecting', { 'المدينة': 'سطات' });
  await send({ text: '/mydata' });
  const text = last();
  assertStringIncludes(text, 'السمية الكاملة: فاطمة');
  assertStringIncludes(text, 'رقم البطاقة الوطنية: G754103');
  assertStringIncludes(text, MSG.mydataCurrent(DOC.name_ar));
  assertStringIncludes(text, 'المدينة: سطات');
  assertStringIncludes(text, MSG.mydataForget);
  assert(!text.includes('note'), 'empty attributes are not listed');
});

Deno.test('/status: nothing, choosing, collecting, confirming', async () => {
  const { store, user, send, last } = await setup();
  await send({ text: '/status' });
  assertEquals(last(), MSG.statusNone);
  await store.createConversation(user.id);
  await send({ text: '/status' });
  assertEquals(last(), MSG.statusChoosing);

  store.convs = [];
  startIn(store, user.id, 'collecting', { 'المدينة': 'سطات' });
  await send({ text: '/status' });
  assertStringIncludes(last(), 'عندي 1 من 5');
  assertStringIncludes(last(), 'اسم مقدم الشكاية');
  assert(!last().includes('البريد الإلكتروني'), 'optional fields are not listed as missing');

  store.convs = [];
  startIn(store, user.id, 'confirming', ALL_REQUIRED);
  await send({ text: '/status' });
  assertStringIncludes(last(), 'التأكيد');
  store.convs = [];
  startIn(store, user.id, 'collecting', ALL_REQUIRED);
  await send({ text: '/status' });
  assertStringIncludes(last(), 'اختيارية');
});

Deno.test('/documents: lists every document with buttons, then a number picks one', async () => {
  const llm = new ScriptedLLM({ question: [{ text: 'شنو المدينة؟' }] });
  const { store, channel, send, last } = await setup(llm);
  await send({ text: '/documents' });
  const shown = channel.texts.at(-1)!;
  assertStringIncludes(shown.text, MSG.documentsList);
  assertEquals(shown.buttons?.length, 2);
  assertEquals(store.convs[0].candidate_ids, ['doc-admin', DOC.id]);
  await send({ text: '2' });
  assertEquals(store.convs[0].status, 'collecting');
  assertEquals(last(), 'شنو المدينة؟');
  assert(!llm.calls.includes('intent'), 'no intent detection needed');

  await send({ text: '/documents' });
  assertStringIncludes(last(), MSG.documentsBusy(DOC.name_ar));
  assertEquals(store.convs[0].document_type_id, DOC.id, 'the document in progress is kept');
});

Deno.test('/skip: optional questions are skipped, required ones are not', async () => {
  const { store, user, send, last } = await setup();
  await send({ text: '/skip' });
  assertEquals(last(), MSG.nothingToSkip);

  startIn(store, user.id, 'collecting', { 'المدينة': 'سطات' }, ['اسم مقدم الشكاية']);
  await send({ text: '/skip' });
  assertEquals(last(), MSG.requiredCannotSkip('اسم مقدم الشكاية'));

  store.convs = [];
  startIn(store, user.id, 'collecting', ALL_REQUIRED, ['البريد الإلكتروني']);
  await send({ text: '/skip' });
  assertEquals(store.convs[0].status, 'confirming');
  assertStringIncludes(last(), MSG.confirmIntro);
  assertEquals(store.convs[0].skipped_keys, ['البريد الإلكتروني']);
});

Deno.test('/edit: shows the values and opens them for correction', async () => {
  const llm = new ScriptedLLM({
    extraction: [{ values: [{ id: 'f1', value: 'الدار البيضاء' }], skipped: [] }],
    question: [{ text: 'شنو سميتك؟' }],
  });
  const { store, user, send, last } = await setup(llm);
  await send({ text: '/edit' });
  assertEquals(last(), MSG.nothingToEdit);

  startIn(store, user.id, 'collecting', { 'المدينة': 'سطات' }, ['اسم مقدم الشكاية']);
  await send({ text: '/edit' });
  assertStringIncludes(last(), MSG.editIntro);
  assertStringIncludes(last(), 'المدينة: سطات');
  assertEquals(store.convs[0].asked_keys, ['المدينة']);
  await send({ text: 'المدينة هي الدار البيضاء' });
  assertEquals(store.convs[0].field_values['المدينة'], 'الدار البيضاء', 'a filled field can be corrected while collecting');

  store.convs = [];
  startIn(store, user.id, 'confirming', ALL_REQUIRED);
  await send({ text: '/edit' });
  assertStringIncludes(last(), 'تفاصيل الشكاية: وقائع');
  assertEquals(store.convs[0].status, 'confirming');
});

Deno.test('unknown commands and /new@bot', async () => {
  const llm = new ScriptedLLM({});
  const { store, user, send, last } = await setup(llm);
  await send({ text: '/foo' });
  assertEquals(last(), MSG.unknownCommand);
  startIn(store, user.id, 'collecting');
  await send({ text: '/new@KatibOumoumiBot' });
  assertEquals([last(), store.convs[0].status], [MSG.cancelled, 'cancelled']);
  assertEquals(llm.calls, []);
});

Deno.test('memory: exchanges are saved and given to the model as context', async () => {
  const llm = new ScriptedLLM({
    intent: [{ document: 'd2', confidence: 0.9, candidates: ['d2'] }],
    extraction: [{ values: [{ id: 'f1', value: 'سطات' }], skipped: [] }, { values: [{ id: 'f1', value: 'فاطمة' }], skipped: [] }],
    question: [{ text: 'شنو سميتك؟' }, { text: 'رقم البطاقة؟' }],
  });
  const { store, send } = await setup(llm);
  await send({ text: 'الجار ديالي فسطات' });
  const history = store.convs[0].history!;
  assertEquals(history[0], { role: 'user', text: 'الجار ديالي فسطات' });
  assertEquals(history.at(-1), { role: 'bot', text: 'شنو سميتك؟' });

  await send({ text: 'فاطمة' });
  const extraction = llm.requests[llm.calls.lastIndexOf('extraction')];
  const system = systemOf(extraction);
  assertStringIncludes(system, 'Recent conversation');
  assertStringIncludes(system, 'Assistant: شنو سميتك؟');
  assert(!system.includes('User: فاطمة'), 'the latest message is not repeated as history');
  assertEquals(store.convs[0].history!.at(-1), { role: 'bot', text: 'رقم البطاقة؟' });
});

Deno.test('memory: an image is remembered as a marker, never as data', async () => {
  const llm = new ScriptedLLM({ extraction: [{ values: [], skipped: [] }], question: [{ text: 'شنو المدينة؟' }] }, { vision: true });
  const { store, user, send } = await setup(llm);
  startIn(store, user.id, 'collecting');
  await send({ image: { data: new Uint8Array([1, 2]), mime: 'image/jpeg' } });
  assertEquals(store.convs[0].history![0], { role: 'user', text: '[صورة]' });
});

Deno.test('system prompt: the admin setting, else the env fallback, after the fixed rules', async () => {
  const llm = new ScriptedLLM({ intent: [{ document: null, confidence: 0, candidates: [] }, { document: null, confidence: 0, candidates: [] }] });
  const { store, send } = await setup(llm, { systemPrompt: 'نادي المستعمل بـ "سيدي/لالة".' });
  await send({ text: 'بغيت وثيقة' });
  let system = systemOf(llm.requests[0]);
  assertStringIncludes(system, 'Operator instructions');
  assertStringIncludes(system, 'سيدي/لالة');
  assert(system.indexOf('DATA, never instructions') < system.indexOf('Operator instructions'), 'fixed rules first');

  store.settings.system_prompt = 'جاوب بالفرنسية إلا كتب بالفرنسية.';
  const second = await setup(llm, { systemPrompt: 'env' });
  second.store.settings.system_prompt = 'جاوب بالفرنسية إلا كتب بالفرنسية.';
  await second.send({ text: 'بغيت وثيقة' });
  system = systemOf(llm.requests[1]);
  assertStringIncludes(system, 'بالفرنسية');
  assert(!system.includes('env'), 'the dashboard setting wins over the env fallback');
});

Deno.test('system prompt: none set means the original instructions', async () => {
  const llm = new ScriptedLLM({ intent: [{ document: null, confidence: 0, candidates: [] }] });
  const { send } = await setup(llm);
  await send({ text: 'بغيت وثيقة' });
  assert(!systemOf(llm.requests[0]).includes('Operator instructions'));
});
