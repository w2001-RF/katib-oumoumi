// Telemetry: classification, recording, and what each adapter reports.
// Run: npx deno test --config tests/deno.json --allow-env supabase/functions
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
// @ts-types="../../../../tests/support/fakeSupabase.d.ts"
import { createFakeClient, kind } from '../../../../tests/support/fakeSupabase.js';
import { handleMessage } from '../agent/engine.ts';
import { inputKind } from '../agent/telemetry.ts';
import { capabilitiesFor } from '../ai/models.ts';
import { OpenAICompatibleLLM } from '../ai/openaiCompatible.ts';
import { describeAiConfig, getLLM, getSTT, getTTS } from '../ai/registry.ts';
import { LLMAudioSTT, OpenAICompatibleSTT, OpenAICompatibleTTS } from '../ai/speech.ts';
import { type ChatRequest, LLMError } from '../ai/types.ts';
import { TelegramChannel } from '../channels/telegram.ts';
import { GotenbergRenderer, HtmlFileRenderer } from '../docs/render.ts';
import { DOC, MemoryStore, msg, RecordingChannel, ScriptedLLM } from '../testing/agentFakes.ts';
import { jsonResponse, withFetch } from '../testing/fakeFetch.ts';
import { errorKindFor, errorText, providerOf, readRateLimit, redact } from './classify.ts';
import { type CallRow, MetricsRecorder, type MetricsSink, metricsSinkFromEnv, SupabaseMetricsSink, type TurnRow } from './recorder.ts';
import { emit, type ServiceCallEvent } from './types.ts';

class MemorySink implements MetricsSink {
  turns: TurnRow[] = [];
  calls: CallRow[] = [];
  fail = false;
  write(turn: TurnRow, calls: CallRow[]) {
    if (this.fail) return Promise.reject(new Error('relation "agent_turns" does not exist'));
    this.turns.push(turn);
    this.calls.push(...calls);
    return Promise.resolve();
  }
}

const collect = () => {
  const events: ServiceCallEvent[] = [];
  return { events, observe: (e: ServiceCallEvent) => events.push(e) };
};

Deno.test('error kinds from HTTP status and network messages', () => {
  assertEquals(
    [429, 503, 529, 500, 502, 404, 408, 504, 401, 403, 400, 422, 418].map((s) => errorKindFor(s)),
    ['rate_limit', 'overloaded', 'overloaded', 'server_error', 'server_error', 'not_found', 'timeout', 'timeout', 'auth', 'auth',
      'bad_request', 'bad_request', 'other'],
  );
  assertEquals(errorKindFor(null, 'Signal timed out.'), 'timeout');
  assertEquals(errorKindFor(null, 'Empty reply from m'), 'empty_reply');
  assertEquals(errorKindFor(undefined, 'connection refused'), 'network');
  assertEquals(errorKindFor(200, 'Empty reply from m'), 'empty_reply');
});

Deno.test('provider names from base URLs', () => {
  assertEquals(providerOf('https://generativelanguage.googleapis.com/v1beta/openai/'), 'google');
  assertEquals(providerOf('https://api.groq.com/openai/v1'), 'groq');
  assertEquals(providerOf('https://openrouter.ai/api/v1'), 'openrouter');
  assertEquals(providerOf('http://10.0.0.5:11434/v1'), '10.0.0.5');
  assertEquals(providerOf('not a url'), 'unknown');
});

Deno.test('rate-limit headers, secrets removed from errors', () => {
  const h = new Headers({ 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '998', 'x-ratelimit-remaining-tokens': 'n/a' });
  assertEquals(readRateLimit(h), { limitRequests: 1000, remainingRequests: 998, limitTokens: undefined, remainingTokens: undefined });
  assertEquals(readRateLimit(new Headers({ 'x-ratelimit-limit-tokens': ' ' })), undefined);
  assertEquals(redact('error sending request for url (https://api.telegram.org/bot123456:AAH-x_y/sendMessage)'),
    'error sending request for url (https://api.telegram.org/bot<token>/sendMessage)');
  assertEquals(redact('GET https://x/v1?key=AIzaSECRET&alt=json'), 'GET https://x/v1?key=<redacted>&alt=json');
  assertEquals(redact('x'.repeat(500)).length, 300);
  assertEquals(errorText('plain'), 'plain');
});

Deno.test('emit never lets an observer break the caller', () => {
  emit(undefined, { service: 'llm', provider: 'p', operation: 'chat', ok: true, latencyMs: 1 });
  emit(() => { throw new Error('observer bug'); }, { service: 'llm', provider: 'p', operation: 'chat', ok: true, latencyMs: 1 });
});

Deno.test('recorder: one turn row and its calls, linked; failures are swallowed', async () => {
  const sink = new MemorySink();
  const rec = new MetricsRecorder(sink, () => new Date('2026-10-16T10:00:00Z'));
  rec.observe({ service: 'llm', provider: 'google', model: 'gemini', role: 'main', operation: 'chat', task: 'intent', ok: true,
    latencyMs: 812.4, inputTokens: 10, outputTokens: 2, rateLimit: { remainingRequests: 5 } });
  rec.observe({ service: 'llm', provider: 'google', operation: 'chat', ok: false, httpStatus: 503, latencyMs: -3,
    error: 'bot1:abc failed' });
  await rec.finishTurn({ channel: 'telegram', inputKind: 'text', outcome: 'busy', documentGenerated: false, latencyMs: 61000.6,
    error: 'HTTP 503' });
  assertEquals(sink.turns.length, 1);
  const turn = sink.turns[0];
  assertEquals([turn.channel, turn.outcome, turn.latency_ms, turn.created_at], ['telegram', 'busy', 61001, '2026-10-16T10:00:00.000Z']);
  assertEquals(sink.calls.map((c) => [c.turn_id, c.channel, c.ok, c.error_kind]), [
    [turn.id, 'telegram', true, null], [turn.id, 'telegram', false, 'other'],
  ]);
  assertEquals([sink.calls[0].latency_ms, sink.calls[0].rl_remaining_requests, sink.calls[1].latency_ms], [812, 5, 0]);
  assertEquals(sink.calls[1].error, 'bot<token> failed');

  // Calls are flushed with their turn, then the buffer is empty.
  await rec.finishTurn({ channel: 'telegram', inputKind: 'text', outcome: 'ok', documentGenerated: false, latencyMs: 1 });
  assertEquals(sink.calls.length, 2);

  sink.fail = true;
  await rec.finishTurn({ channel: 'telegram', inputKind: 'text', outcome: 'ok', documentGenerated: false, latencyMs: 1 });

  const off = new MetricsRecorder(null);
  off.observe({ service: 'llm', provider: 'p', operation: 'chat', ok: true, latencyMs: 1 });
  await off.finishTurn({ channel: 'telegram', inputKind: 'text', outcome: 'ok', documentGenerated: false, latencyMs: 1 });

  const capped = new MetricsRecorder(sink);
  sink.fail = false;
  for (let i = 0; i < 150; i++) capped.observe({ service: 'channel', provider: 'telegram', operation: 'sendMessage', ok: true, latencyMs: 1 });
  await capped.finishTurn({ channel: 'telegram', inputKind: 'text', outcome: 'ok', documentGenerated: false, latencyMs: 1 });
  assertEquals(sink.calls.length, 2 + 100, 'at most 100 calls per turn');
});

Deno.test('Supabase sink: turn first, then calls; errors raised; env switch', async () => {
  const db = createFakeClient(() => ({ data: null, error: null }));
  const sink = new SupabaseMetricsSink(db as unknown as SupabaseClient);
  await sink.write({ id: 't1' }, [{ a: 1 }]);
  await sink.write({ id: 't2' }, []);
  assertEquals(db.calls.map((c: { table: string }) => `${kind(c)}:${c.table}`), ['insert:agent_turns', 'insert:agent_service_calls', 'insert:agent_turns']);
  db.reset((call: { table: string }) => ({ data: null, error: call.table === 'agent_service_calls' ? { message: 'calls down' } : null }));
  await assertRejects(() => sink.write({ id: 't3' }, [{ a: 1 }]), Error, 'calls down');
  db.reset(() => ({ data: null, error: { message: 'turns down' } }));
  await assertRejects(() => sink.write({ id: 't4' }, []), Error, 'turns down');

  assertEquals(metricsSinkFromEnv(() => undefined), null);
  assertEquals(metricsSinkFromEnv((n) => ({ AGENT_METRICS: 'OFF', SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k' })[n]), null);
  assert(metricsSinkFromEnv((n) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' })[n]) instanceof SupabaseMetricsSink);
});

Deno.test('LLM calls report task, role, tokens, rate limits and every retry', async () => {
  const { events, observe } = collect();
  const llm = new OpenAICompatibleLLM({
    baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', model: 'openai/gpt-oss-120b', caps: capabilitiesFor('x'),
    observe, role: 'fallback', sleep: () => Promise.resolve(),
  });
  const answers = [
    () => new Response('busy', { status: 503 }),
    () => new Response(JSON.stringify({ choices: [{ message: { content: '{"text":"سؤال"}' } }], usage: { prompt_tokens: 120, completion_tokens: 9 } }),
      { status: 200, headers: { 'x-ratelimit-remaining-requests': '41', 'x-ratelimit-limit-requests': '1000' } }),
  ];
  await withFetch(() => answers.shift()!(), async () => {
    assertEquals(await llm.json({ messages: [] }, {}, 'question'), { text: 'سؤال' });
  });
  assertEquals(events.map((e) => [e.provider, e.role, e.task, e.ok, e.attempt, e.errorKind]), [
    ['groq', 'fallback', 'question', false, 0, 'overloaded'],
    ['groq', 'fallback', 'question', true, 1, undefined],
  ]);
  assertEquals([events[1].inputTokens, events[1].outputTokens, events[1].rateLimit?.remainingRequests], [120, 9, 41]);
  assertEquals(events[0].httpStatus, 503);

  events.length = 0;
  const once = new OpenAICompatibleLLM({ baseUrl: 'https://x/v1', apiKey: '', model: 'm', caps: capabilitiesFor('m'), observe, retries: 0 });
  await withFetch(() => jsonResponse({ choices: [] }), async () => {
    await assertRejects(() => once.chat({ messages: [], task: 'transcribe' }), LLMError);
  });
  await withFetch(() => Promise.reject(new TypeError('Signal timed out.')), async () => {
    await assertRejects(() => once.chat({ messages: [] }), LLMError);
  });
  assertEquals(events.map((e) => [e.task, e.errorKind, e.httpStatus]), [['transcribe', 'empty_reply', 200], [undefined, 'timeout', null]]);
});

Deno.test('speech adapters report duration, characters and failures', async () => {
  const { events, observe } = collect();
  const stt = new OpenAICompatibleSTT('https://api.groq.com/openai/v1', 'k', 'whisper-large-v3', 'ar', observe);
  await withFetch(() => jsonResponse({ text: ' سلام ' }), async () => {
    assertEquals(await stt.transcribe(new Uint8Array([1]), 'audio/ogg', 7), 'سلام');
  });
  await withFetch(() => new Response('quota', { status: 429 }), async () => {
    await assertRejects(() => stt.transcribe(new Uint8Array([1]), 'audio/ogg'), LLMError);
  });
  await withFetch(() => Promise.reject(new TypeError('connection reset')), async () => {
    const e = await assertRejects(() => stt.transcribe(new Uint8Array([1]), 'audio/ogg'), LLMError);
    assertEquals(e.transient, true, 'a network failure lets the user simply resend');
  });
  const tts = new OpenAICompatibleTTS('https://tts.local/v1', '', 'kokoro', 'af', 'opus', observe);
  await withFetch(() => new Response(new Uint8Array([1, 2])), async () => {
    await tts.speak('مرحبا');
  });
  await withFetch(() => Promise.reject(new TypeError('down')), async () => {
    await assertRejects(() => tts.speak('x'), LLMError);
  });
  assertEquals(events.map((e) => [e.service, e.provider, e.ok, e.units, e.errorKind]), [
    ['stt', 'groq', true, 7, undefined],
    ['stt', 'groq', false, undefined, 'rate_limit'],
    ['stt', 'groq', false, undefined, 'network'],
    ['tts', 'tts.local', true, 5, undefined],
    ['tts', 'tts.local', false, 1, 'network'],
  ]);

  // A model that hears audio: the transcription is an LLM call tagged "transcribe".
  let task: string | undefined;
  const llm = Object.assign(new ScriptedLLM({}), {
    chat: (req: ChatRequest) => {
      task = req.task;
      return Promise.resolve(' نص ');
    },
  });
  assertEquals(await new LLMAudioSTT(llm).transcribe(new Uint8Array([1]), 'audio/ogg'), 'نص');
  assertEquals(task, 'transcribe');
});

Deno.test('PDF service and Telegram calls are reported, without the bot token', async () => {
  const { events, observe } = collect();
  const pdf = new GotenbergRenderer('https://pdf.example.com', undefined, observe);
  await withFetch(() => new Response(new Uint8Array([37, 80])), async () => {
    await pdf.render('<p>x</p>', 'وثيقة');
  });
  await withFetch(() => new Response('oops', { status: 502 }), async () => {
    await assertRejects(() => pdf.render('<p>x</p>', 'وثيقة'));
  });
  await withFetch(() => Promise.reject(new TypeError('dns')), async () => {
    await assertRejects(() => pdf.render('<p>x</p>', 'وثيقة'));
  });

  const tg = new TelegramChannel('123:SECRET', observe);
  await withFetch(() => jsonResponse({ ok: true, result: true }), async () => {
    await tg.sendText('7', 'x');
    await tg.showActivity('7', 'typing');
  });
  await withFetch(() => Promise.reject(new TypeError('error sending request for url (https://api.telegram.org/bot123:SECRET/sendMessage)')),
    async () => {
      await assertRejects(() => tg.sendText('7', 'x'));
    });
  const files = [() => jsonResponse({ ok: true, result: { file_path: 'v.ogg' } }), () => new Response('gone', { status: 404 })];
  await withFetch(() => files.shift()!(), async () => {
    await assertRejects(() => tg.download('f'));
  });

  assertEquals(events.map((e) => [e.service, e.operation, e.ok, e.errorKind ?? null]), [
    ['pdf', 'render', true, null],
    ['pdf', 'render', false, 'server_error'],
    ['pdf', 'render', false, 'network'],
    ['channel', 'sendMessage', true, null],
    ['channel', 'sendMessage', false, 'network'],
    ['channel', 'getFile', true, null],
    ['channel', 'downloadFile', false, 'not_found'],
  ]);
  assert(!JSON.stringify(events).includes('SECRET'), 'the bot token never reaches telemetry');
});

Deno.test('registry wires the observer into every role, speech and voice', async () => {
  const env = (vars: Record<string, string>) => (n: string) => vars[n];
  const { events, observe } = collect();
  const vars = {
    LLM_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/', LLM_API_KEY: 'g', LLM_MODEL: 'gemini-3.8-flash',
    LLM_FALLBACK_BASE_URL: 'https://api.groq.com/openai/v1', LLM_FALLBACK_API_KEY: 'q', LLM_FALLBACK_MODEL: 'openai/gpt-oss-120b',
    LLM_RETRIES: '0',
  };
  const answers = [() => new Response('gone', { status: 404 }), () => jsonResponse({ choices: [{ message: { content: 'ok' } }] })];
  await withFetch(() => answers.shift()!(), async () => {
    assertEquals(await getLLM('fast', env(vars), observe).chat({ messages: [] }), 'ok');
  });
  assertEquals(events.map((e) => [e.provider, e.role, e.ok]), [['google', 'fast', false], ['groq', 'fallback', true]]);
  const { LLM_FALLBACK_MODEL: _, ...noFallback } = vars;
  assert(getSTT(env(noFallback), observe) instanceof LLMAudioSTT);
  assert(getSTT(env({ ...vars, STT_BASE_URL: 'https://api.groq.com/openai/v1', STT_MODEL: 'whisper-large-v3' }), observe) instanceof OpenAICompatibleSTT);
  assert(getTTS(env({ TTS_BASE_URL: 'https://t/v1', TTS_MODEL: 'm' }), observe) instanceof OpenAICompatibleTTS);
});

Deno.test('describeAiConfig lists roles and services without any key', () => {
  const vars: Record<string, string> = {
    LLM_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/', LLM_API_KEY: 'SECRET-G', LLM_MODEL: 'gemini-3.8-flash',
    LLM_FAST_MODEL: 'gemini-3.8-flash-lite',
    LLM_FALLBACK_BASE_URL: 'https://api.groq.com/openai/v1', LLM_FALLBACK_API_KEY: 'SECRET-Q', LLM_FALLBACK_MODEL: 'openai/gpt-oss-120b',
    TTS_BASE_URL: 'https://tts.local/v1', TTS_MODEL: 'kokoro', LLM_RETRIES: '3', LLM_TIMEOUT_MS: '30000',
  };
  const info = describeAiConfig((n) => vars[n]);
  assertEquals(info.roles.map((r) => [r.role, r.provider, r.model, r.own, r.hasKey]), [
    ['main', 'google', 'gemini-3.8-flash', true, true],
    ['vision', 'google', 'gemini-3.8-flash', false, true],
    ['fast', 'google', 'gemini-3.8-flash-lite', true, true],
    ['fallback', 'groq', 'openai/gpt-oss-120b', true, true],
  ]);
  assertEquals(info.stt.mode, 'main-model', 'Gemini hears audio');
  assertEquals([info.tts.configured, info.tts.hasKey, info.retries, info.timeoutMs], [true, false, 3, 30000]);
  assert(!JSON.stringify(info).includes('SECRET'));

  const bare = describeAiConfig((n) => ({ LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'llama-3.3-70b' })[n]);
  assertEquals([bare.stt.mode, bare.tts.configured, bare.retries, bare.roles.length], ['none', false, 2, 3]);
  const withStt = describeAiConfig((n) => ({ STT_BASE_URL: 'https://api.groq.com/openai/v1', STT_MODEL: 'whisper-large-v3' })[n]);
  assertEquals([withStt.stt.mode, withStt.stt.provider, withStt.roles.length], ['endpoint', 'groq', 0]);
});

Deno.test('engine: one turn record per message with outcome, state and timing', async () => {
  const sink = new MemorySink();
  const store = new MemoryStore();
  const channel = new RecordingChannel();
  const llm = new ScriptedLLM({ intent: [{ document: 'd2', confidence: 0.9, candidates: [] }], extraction: [], question: [] });
  const deps = (metrics: MetricsRecorder) => ({
    store, channel, llm: () => llm, stt: null, tts: null, renderer: new HtmlFileRenderer(), today: () => '2026-10-16', metrics,
  });
  const turn = async (m: Parameters<typeof handleMessage>[1]) => {
    await handleMessage(deps(new MetricsRecorder(sink)), m);
    return sink.turns.at(-1)!;
  };

  const consent = await turn(msg({ text: 'نعم', receivedAt: Date.now() - 50 }));
  assertEquals([consent.outcome, consent.input_kind, consent.state_before], ['ok', 'text', null]);
  assert((consent.latency_ms as number) >= 50, 'measured from when the update arrived');

  // Extraction has no scripted answer: the turn fails and says so.
  const failed = await turn(msg({ text: 'بغيت شكاية على الجار' }));
  assertEquals([failed.outcome, failed.state_before, failed.state_after, failed.document_type_id], ['error', 'new', 'collecting', DOC.id]);
  assert(String(failed.error).includes('no scripted answer'));

  const help = await turn(msg({ text: '/help' }));
  assertEquals([help.input_kind, help.conversation_id], ['command', null]);

  const repeated = msg({ text: 'x' });
  await turn(repeated);
  assertEquals((await turn(repeated)).outcome, 'duplicate');

  store.upsertUser = () => Promise.reject(new Error('db down'));
  await assertRejects(() => handleMessage(deps(new MetricsRecorder(sink)), msg({ text: 'x' })), Error, 'db down');
  assertEquals([sink.turns.at(-1)!.outcome, sink.turns.at(-1)!.error], ['error', 'db down']);
});

Deno.test('input kinds', () => {
  const base = msg({});
  assertEquals([
    inputKind({ ...base, action: 'doc:1' }), inputKind({ ...base, audio: { data: new Uint8Array(), mime: 'audio/ogg' } }),
    inputKind({ ...base, image: { data: new Uint8Array(), mime: 'image/png' } }), inputKind({ ...base, unsupported: 'pdf' }),
    inputKind({ ...base, text: ' /new' }), inputKind({ ...base, text: 'سلام' }), inputKind(base),
  ], ['action', 'voice', 'image', 'other', 'command', 'text', 'text']);
});
