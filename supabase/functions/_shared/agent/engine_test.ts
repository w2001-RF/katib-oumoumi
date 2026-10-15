// Run: npx deno test --allow-env supabase/functions/_shared
// End-to-end conversation with an in-memory store, a recording channel and a
// scripted model — no network, no database.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { HtmlFileRenderer } from '../docs/render.ts';
import { DOC, MemoryStore, msg, RecordingChannel, ScriptedLLM } from '../testing/agentFakes.ts';
import { handleMessage, missingFields, nextBatch } from './engine.ts';
import type { Conversation } from './types.ts';


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
