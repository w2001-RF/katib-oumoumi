// Branches of the conversation beyond the happy path: commands, voice,
// images, menus, corrections and failures.
// Run: npx deno test --allow-env supabase/functions/_shared
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { type LLM, LLMError } from '../ai/types.ts';
import { type DocumentRenderer, HtmlFileRenderer } from '../docs/render.ts';
import { DOC, FakeSTT, FakeTTS, MemoryStore, msg, RecordingChannel, ScriptedLLM } from '../testing/agentFakes.ts';
import { type AgentDeps, buildSummary, forSpeech, handleMessage } from './engine.ts';
import { isCancel, isYes, MSG } from './messages.ts';
import type { Conversation } from './types.ts';

async function setup(llm: LLM = new ScriptedLLM({}), extra: Partial<AgentDeps> = {}) {
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const user = await store.upsertUser('telegram', '42', 'Fatima');
  await store.setConsent(user.id);
  const deps: AgentDeps = { store, channel, llm: () => llm, stt: null, tts: null, renderer: new HtmlFileRenderer(), today: () => '2026-10-15', ...extra };
  const send = (m: Parameters<typeof msg>[0]) => handleMessage(deps, msg(m));
  const last = () => channel.texts.at(-1)?.text ?? '';
  return { store, channel, user, deps, send, last };
}

// Puts the user straight into a document at the given status.
function startIn(store: MemoryStore, userId: string, status: Conversation['status'], values: Record<string, string> = {}) {
  store.convs.push({
    id: 'c1', user_id: userId, status, document_type_id: DOC.id, candidate_ids: [],
    field_values: values, field_summaries: {}, skipped_keys: [], asked_keys: [],
  });
}

const ALL_VALUES = { 'المدينة': 'سطات', 'اسم مقدم الشكاية': 'فاطمة', 'رقم البطاقة الوطنية': 'G754103', 'تفاصيل الشكاية': 'وقائع' };

Deno.test('yes / cancel words', () => {
  for (const yes of ['نعم', ' Oui ', 'واخا!', 'ok?', 'صحيح.', '1']) assert(isYes(yes), yes);
  for (const no of ['لا', 'نعم ولكن', '', 'yes please']) assert(!isYes(no), no);
  assert(isCancel(' /new ') && isCancel('Annuler') && !isCancel('new'));
});

Deno.test('commands: /help, /start, cancel, /forget', async () => {
  const { store, user, send, last } = await setup();
  await send({ text: '/help' });
  assertStringIncludes(last(), '/forget');
  await send({ text: '/start' });
  assertEquals(last(), MSG.welcome);
  startIn(store, user.id, 'collecting');
  await send({ text: 'إلغاء' });
  assertEquals([last(), store.convs[0].status], [MSG.cancelled, 'cancelled']);
  await send({ text: '/forget' });
  assertEquals([last(), store.users.get(user.id)?.consent_at], [MSG.forgotten, null]);
});

Deno.test('before consent: /start shows the notice, anything else asks again, nothing reaches the model', async () => {
  const llm = new ScriptedLLM({});
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const deps = { store, channel, llm: () => llm, stt: new FakeSTT('x'), tts: null, renderer: new HtmlFileRenderer() };
  await handleMessage(deps, msg({ text: '/start' }));
  assertEquals(channel.texts.at(-1)?.text, MSG.consent);
  await handleMessage(deps, msg({ audio: { data: new Uint8Array([1]), mime: 'audio/ogg' } }));
  assertStringIncludes(channel.texts.at(-1)!.text, MSG.consentNeeded);
  await handleMessage(deps, msg({ text: 'نعم' }));
  assertEquals(channel.texts.at(-1)?.text, MSG.welcome);
  assertEquals(llm.calls, []);
});

Deno.test('unsupported files and empty messages', async () => {
  const { channel, send, last } = await setup();
  await send({ unsupported: 'application/pdf' });
  assertEquals(last(), MSG.unsupported);
  const before = channel.texts.length;
  await send({ text: '   ' });
  assertEquals(channel.texts.length, before, 'nothing to answer');
});

Deno.test('voice: unsupported without STT', async () => {
  const { send, last } = await setup();
  await send({ audio: { data: new Uint8Array([1]), mime: 'audio/ogg' } });
  assertEquals(last(), MSG.voiceNotSupported);
});

const VOICE = { audio: { data: new Uint8Array([1]), mime: 'audio/ogg', seconds: 4 } };

Deno.test('voice: transcribed, the transcript shown, answered by voice; typing a sentence goes back to text', async () => {
  const intent = { document: null, confidence: 0.2, candidates: [] };
  const llm = new ScriptedLLM({ intent: [intent, intent, intent] });
  const tts = new FakeTTS();
  const { store, user, channel, send } = await setup(llm, { stt: new FakeSTT('بغيت شي حاجة'), tts });
  await send(VOICE);
  assertEquals(store.users.get(user.id)?.prefers_voice, true);
  assertEquals(channel.texts[0].text, MSG.heard('بغيت شي حاجة'), 'what was understood comes first');
  assertEquals(channel.voices.length, 1, 'the menu was spoken, not the transcript');
  assert(!tts.spoken[0].includes('✅'), 'no emoji read aloud');
  assert(!store.convs[0].history?.some((h) => h.text.includes('🎙️')), 'the transcript echo is not kept in the memory');

  await send({ text: 'G754103' });
  assertEquals(store.users.get(user.id)?.prefers_voice, true, 'a typed value keeps voice replies');
  assertEquals(channel.voices.length, 2);

  await send({ text: 'غادي نكتب ليك من دابا' });
  assertEquals(store.users.get(user.id)?.prefers_voice, false, 'a typed sentence switches to text');
  assertEquals(channel.voices.length, 2, 'text reply only');
});

Deno.test('voice: a voice note too long is refused before transcription', async () => {
  const stt = new FakeSTT('x');
  const { send, last } = await setup(new ScriptedLLM({}), { stt });
  await send({ audioTooLong: 600 });
  assertEquals(last(), MSG.voiceTooLong(3));
  assertEquals(stt.hints.length, 0, 'not transcribed');
});

Deno.test('voice: a failing transcription asks to resend or type, without a technical error', async () => {
  const llm = new ScriptedLLM({});
  const { send, last } = await setup(llm, { stt: new FakeSTT('', true) });
  await send(VOICE);
  assertEquals(last(), MSG.voiceFailed);
  assertEquals(llm.calls, [], 'nothing reaches the model');
});

Deno.test('voice: the transcriber is told what may be said', async () => {
  const stt = new FakeSTT('سطات');
  const llm = new ScriptedLLM({ intent: [{ document: null, confidence: 0, candidates: [] }], extraction: [{ values: [], skipped: [] }],
    question: [{ text: 'شنو سميتك؟' }] });
  const { store, user, send } = await setup(llm, { stt });
  await send(VOICE);
  assertStringIncludes(stt.hints[0] ?? '', DOC.name_ar, 'while choosing: the documents on offer');

  store.convs = [];
  startIn(store, user.id, 'collecting');
  store.convs[0].asked_keys = ['المدينة'];
  await send(VOICE);
  const hint = stt.hints[1] ?? '';
  for (const word of [DOC.name_ar, 'المدينة', 'سطات', 'الدار البيضاء']) assertStringIncludes(hint, word);
  assert(!hint.includes('أخرى'), '«أخرى» is not a word to expect');
});

Deno.test('/voice: turns voice replies on and off, or says they are not available', async () => {
  const { store, user, send, last, channel } = await setup(new ScriptedLLM({}), { tts: new FakeTTS() });
  await send({ text: '/voice' });
  assertEquals([last(), store.users.get(user.id)?.prefers_voice], [MSG.voiceOn, true]);
  assertEquals(channel.voices.length, 1, 'confirmed by voice');
  await send({ text: '/voice' });
  assertEquals([last(), store.users.get(user.id)?.prefers_voice], [MSG.voiceOff, false]);

  const without = await setup();
  await without.send({ text: '/voice' });
  assertEquals(without.last(), MSG.voiceRepliesUnavailable);
});

Deno.test('forSpeech: no emoji, links, markup or commands; long texts cut at a sentence end', () => {
  assertEquals(forSpeech('✅ مزيان! شوف https://katiboumoumi.online و **/help** • تمام'), 'مزيان! شوف و تمام');
  const long = `${'جملة قصيرة. '.repeat(30)}نهاية`;
  const spoken = forSpeech(long, 100);
  assert(spoken.length <= 100 && spoken.endsWith('.'), spoken);
  assertEquals(forSpeech('كلمة'.repeat(40), 50), `${'كلمة'.repeat(40).slice(0, 50)}…`, 'no sentence end: cut and marked');
});

Deno.test('voice: empty transcript and a failing TTS', async () => {
  const { send, last, channel } = await setup(new ScriptedLLM({}), { stt: new FakeSTT(''), tts: new FakeTTS(true) });
  await send({ audio: { data: new Uint8Array([1]), mime: 'audio/ogg' } });
  assertEquals(last(), MSG.emptyTranscript);
  assertEquals(channel.voices.length, 0, 'TTS failure keeps the text reply');
});

Deno.test('choosing: low confidence shows a numbered menu, a number picks from it', async () => {
  const llm = new ScriptedLLM({
    intent: [{ document: 'd2', confidence: 0.3, candidates: ['d2', 'd9'] }],
    question: [{ text: 'فين؟' }],
  });
  const { store, channel, send, last } = await setup(llm);
  await send({ text: 'عندي مشكل' });
  assertStringIncludes(last(), MSG.chooseDocument);
  assertStringIncludes(last(), '1. شكاية بسبب الجار');
  assertEquals(channel.texts.at(-1)?.buttons?.[0][0].action, `doc:${DOC.id}`);
  await send({ text: '1' });
  assertEquals(store.convs[0].status, 'collecting');
  assertEquals(llm.calls.includes('extraction'), false, 'the number itself is not a story');
});

Deno.test('choosing: no match lists the documents; image first asks for the document; menu button', async () => {
  const llm = new ScriptedLLM({ intent: [{ document: null, confidence: 0, candidates: [] }], question: [{ text: 'q' }] });
  const { store, send, last } = await setup(llm);
  await send({ text: 'بغيت نشري طوموبيل' });
  assertStringIncludes(last(), MSG.noMatch);
  await send({ image: { data: new Uint8Array([1]), mime: 'image/jpeg' } });
  assertEquals(last(), MSG.imageBeforeDocument);
  await send({ action: 'doc:unknown' });
  assertEquals(last(), MSG.askWhichDocument);
  await send({ action: `doc:${DOC.id}` });
  assertEquals(store.convs[0].document_type_id, DOC.id);
});

Deno.test('images: refused without a vision model, sent to the vision model otherwise', async () => {
  const blind = new ScriptedLLM({ question: [{ text: 'q' }] });
  const a = await setup(blind);
  startIn(a.store, a.user.id, 'collecting');
  await a.send({ image: { data: new Uint8Array([1]), mime: 'image/jpeg' } });
  assertEquals(a.channel.texts.at(-2)?.text, MSG.imageNotSupported);

  const main = new ScriptedLLM({ question: [{ text: 'q' }] });
  const vision = new ScriptedLLM({ extraction: [{ values: [{ id: 'f3', value: 'G754103' }], skipped: [] }] }, { vision: true });
  const b = await setup(main, { llm: (role) => (role === 'vision' ? vision : main) });
  startIn(b.store, b.user.id, 'collecting');
  await b.send({ image: { data: new Uint8Array([1]), mime: 'image/jpeg' } });
  assertEquals(b.store.convs[0].field_values['رقم البطاقة الوطنية'], 'G754103');
  const content = vision.requests[0].messages[1].content as { type: string }[];
  assert(content.some((p) => p.type === 'image_url'));
});

Deno.test('a required field cannot be skipped; the fixed question is used when the model fails', async () => {
  const llm = new ScriptedLLM({ extraction: [{ values: [], skipped: ['f1'] }] }); // no "question" answers → fallback
  const { store, user, send, last } = await setup(llm);
  startIn(store, user.id, 'collecting');
  store.convs[0].asked_keys = ['المدينة'];
  await send({ text: 'ما عرفتش' });
  assertStringIncludes(last(), MSG.requiredCannotSkip('المدينة'));
  assertStringIncludes(last(), 'عطيني عافاك: المدينة');
});

Deno.test('a document that disappeared sends the user back to choosing', async () => {
  const llm = new ScriptedLLM({ intent: [{ document: null, confidence: 0, candidates: [] }] });
  const { store, user, send } = await setup(llm);
  startIn(store, user.id, 'collecting');
  store.convs[0].document_type_id = 'deleted-doc';
  await send({ text: 'سلام' });
  assertEquals(store.convs[0].status, 'choosing');
});

Deno.test('confirming: edit button, corrections, rejected corrections, nothing understood', async () => {
  const llm = new ScriptedLLM({
    extraction: [
      { values: [{ id: 'f3', value: 'AB123456' }], skipped: [] },
      { values: [{ id: 'f3', value: '123' }], skipped: [] },
      { values: [], skipped: [] },
    ],
    question: [{ text: 'رقم البطاقة ماشي صحيح' }],
  });
  const { store, user, send, last } = await setup(llm);
  startIn(store, user.id, 'confirming', { ...ALL_VALUES });
  store.convs[0].skipped_keys = ['البريد الإلكتروني'];

  await send({ action: 'confirm:edit' });
  assertEquals(last(), MSG.whatToEdit);
  await send({ text: 'رقم البطاقة هو AB123456' });
  assertStringIncludes(last(), 'AB123456');
  assertStringIncludes(last(), MSG.confirmQuestion);
  await send({ text: 'البطاقة 123' });
  assertEquals(last(), 'رقم البطاقة ماشي صحيح');
  await send({ text: 'هههه' });
  assertEquals(last(), MSG.whatToEdit);
});

Deno.test('generating: PDF caption, profile saved, next steps sent', async () => {
  const pdf: DocumentRenderer = { render: () => Promise.resolve({ data: new Uint8Array([1]), filename: 'x.pdf', mime: 'application/pdf' }) };
  const { store, user, channel, send } = await setup(new ScriptedLLM({}), { renderer: pdf });
  startIn(store, user.id, 'confirming', { ...ALL_VALUES });
  await send({ text: 'oui' });
  assertEquals(channel.files[0].filename, 'x.pdf');
  assertEquals(store.convs[0].status, 'done');
  assertStringIncludes(channel.texts.at(-1)!.text, DOC.next_steps_ar);
  assertEquals(store.profiles.get(user.id), { full_name: 'فاطمة', cin: 'G754103' });
});

Deno.test('unexpected failures end with an apology instead of silence', async () => {
  const { store, user, send, last } = await setup();
  startIn(store, user.id, 'confirming', { ...ALL_VALUES });
  store.logGenerated = () => Promise.reject(new Error('db down'));
  await send({ action: 'confirm:yes' });
  assertEquals(last(), MSG.error);
});

Deno.test('an overloaded AI provider gets a "busy, resend" reply, not a technical error', async () => {
  const overloaded: LLM = {
    name: 'busy', caps: { tools: false, json: 'none', vision: false, audioInput: false },
    chat: () => Promise.reject(new LLMError('HTTP 503', 503, true)),
    json: () => Promise.reject(new LLMError('HTTP 503', 503, true)),
  };
  const { send, last } = await setup(overloaded);
  await send({ text: 'بغيت شكاية' });
  assertEquals(last(), MSG.busy);
});

Deno.test('voice summary spells the CIN and phone and reads the long text as its summary', () => {
  const conv = {
    field_values: { ...ALL_VALUES, 'تفاصيل الشكاية': 'نص رسمي طويل' },
    field_summaries: { 'تفاصيل الشكاية': 'ملخص بالدارجة' },
  } as unknown as Conversation;
  const { text, spoken } = buildSummary(DOC, conv);
  assertStringIncludes(text, 'نص رسمي طويل');
  assertStringIncludes(spoken, 'G 7 5 4 1 0 3');
  assertStringIncludes(spoken, 'ملخص بالدارجة');
});
