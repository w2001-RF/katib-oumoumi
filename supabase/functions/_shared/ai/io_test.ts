// Speech, PDF rendering and provider wiring against a scripted fetch.
// Run: npx deno test --allow-env supabase/functions/_shared
import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { getRenderer, GotenbergRenderer, HtmlFileRenderer, safeFilename, wrapDocumentHtml } from '../docs/render.ts';
import { jsonResponse, withFetch } from '../testing/fakeFetch.ts';
import { capabilitiesFor } from './models.ts';
import { joinUrl, OpenAICompatibleLLM, trimTrailingSlashes } from './openaiCompatible.ts';
import { getLLM, getSTT, getTTS } from './registry.ts';
import { clipHint, FallbackSTT, LLMAudioSTT, OpenAICompatibleSTT, OpenAICompatibleTTS } from './speech.ts';
import { LLMError, type SpeechToText } from './types.ts';

Deno.test('URL helpers', () => {
  assertEquals(trimTrailingSlashes('https://x/v1///'), 'https://x/v1');
  assertEquals(joinUrl('https://x/v1/', '/chat/completions'), 'https://x/v1/chat/completions');
  assertEquals(joinUrl('https://ollama.local:11434/v1', 'audio/speech'), 'https://ollama.local:11434/v1/audio/speech');
});

Deno.test('LLM errors: retryable vs not, network failures, empty and part-based replies', async () => {
  const llm = new OpenAICompatibleLLM({ baseUrl: 'https://x/v1', apiKey: '', model: 'm', caps: capabilitiesFor('m'), retries: 0 });
  const req = { messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 10 };

  await withFetch(() => new Response('slow down', { status: 429 }), async (reqs) => {
    const e = await assertRejects(() => llm.chat(req), LLMError);
    assertEquals([e.status, e.retryable], [429, true]);
    assertEquals(reqs[0].init.headers, { 'Content-Type': 'application/json' }, 'no Authorization without a key');
    assertEquals((reqs[0].json as { max_tokens: number }).max_tokens, 10);
  });
  await withFetch(() => new Response('bad key', { status: 401 }), async () => {
    assertEquals((await assertRejects(() => llm.chat(req), LLMError)).retryable, false);
  });
  await withFetch(() => new Response('{"error":{"code":404,"message":"model is no longer available"}}', { status: 404 }), async () => {
    const e = await assertRejects(() => llm.chat(req), LLMError);
    assertEquals([e.status, e.retryable], [404, true]);
    assertStringIncludes(e.message, 'check LLM_*MODEL');
  });
  await withFetch(() => Promise.reject(new TypeError('connection refused')), async () => {
    assertEquals((await assertRejects(() => llm.chat(req), LLMError)).retryable, true);
  });
  await withFetch(() => jsonResponse({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }), async () => {
    assertEquals(await llm.chat(req), 'ab');
  });
  await withFetch(() => jsonResponse({ choices: [] }), async () => {
    await assertRejects(() => llm.chat(req), LLMError, 'Empty reply');
  });
  const objectMode = new OpenAICompatibleLLM({ baseUrl: 'https://x', apiKey: 'k', model: 'llama-3.3-70b', caps: capabilitiesFor('llama-3.3-70b') });
  await withFetch(() => jsonResponse({ choices: [{ message: { content: '{"a":1}' } }] }), async (reqs) => {
    assertEquals(await objectMode.json({ messages: [] }, {}, 's'), { a: 1 });
    assertEquals((reqs[0].json as { response_format: unknown }).response_format, { type: 'json_object' });
  });
});

Deno.test('overload (503/429/network) is retried on the same model with backoff', async () => {
  const waits: number[] = [];
  const llm = new OpenAICompatibleLLM({
    baseUrl: 'https://g/v1', apiKey: 'k', model: 'gemini-3.8-flash', caps: capabilitiesFor('gemini-3.8-flash'),
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  const answers = [
    () => new Response('{"error":{"code":503,"message":"high demand"}}', { status: 503 }),
    () => new Response('slow down', { status: 429, headers: { 'Retry-After': '3' } }),
    () => jsonResponse({ choices: [{ message: { content: 'جواب' } }] }),
  ];
  await withFetch(() => answers.shift()!(), async (reqs) => {
    assertEquals(await llm.chat({ messages: [] }), 'جواب');
    assertEquals(reqs.length, 3);
    assertEquals(waits, [1000, 3000], 'exponential backoff, then the provider\'s Retry-After');
  });
});

Deno.test('retries stop after the limit, within the time budget, and never for a retired model', async () => {
  const sleep = () => Promise.resolve();
  const busy = () => new Response('busy', { status: 503 });
  const base = { baseUrl: 'https://g/v1', apiKey: 'k', model: 'm', caps: capabilitiesFor('m'), sleep };

  await withFetch(busy, async (reqs) => {
    const e = await assertRejects(() => new OpenAICompatibleLLM(base).chat({ messages: [] }), LLMError);
    assertEquals([e.status, e.transient, reqs.length], [503, true, 3], '1 try + 2 retries');
  });
  await withFetch(busy, async (reqs) => {
    await assertRejects(() => new OpenAICompatibleLLM({ ...base, retryBudgetMs: 500 }).chat({ messages: [] }), LLMError);
    assertEquals(reqs.length, 1, 'a 1 s wait would exceed the budget');
  });
  await withFetch(() => new Response('gone', { status: 404 }), async (reqs) => {
    const e = await assertRejects(() => new OpenAICompatibleLLM(base).chat({ messages: [] }), LLMError);
    assertEquals([e.retryable, e.transient, reqs.length], [true, false, 1]);
  });
  await withFetch(() => new Response('bad key', { status: 401 }), async (reqs) => {
    await assertRejects(() => new OpenAICompatibleLLM(base).chat({ messages: [] }), LLMError);
    assertEquals(reqs.length, 1);
  });
});

Deno.test('LLM_RETRIES configures the retries', async () => {
  const env: Record<string, string> = { LLM_BASE_URL: 'https://g/v1', LLM_MODEL: 'm', LLM_RETRIES: '0' };
  await withFetch(() => new Response('busy', { status: 503 }), async (reqs) => {
    await assertRejects(() => getLLM('main', (n) => env[n]).chat({ messages: [] }), LLMError);
    assertEquals(reqs.length, 1);
  });
});

Deno.test('a retired main model hands over to the fallback model', async () => {
  const env: Record<string, string> = {
    LLM_BASE_URL: 'https://google/v1beta/openai/', LLM_API_KEY: 'g', LLM_MODEL: 'gemini-2.5-flash',
    LLM_FALLBACK_BASE_URL: 'https://groq/v1', LLM_FALLBACK_API_KEY: 'q', LLM_FALLBACK_MODEL: 'llama-3.3-70b-versatile',
  };
  const llm = getLLM('main', (n) => env[n]);
  const respond = (req: { url: string }) =>
    req.url.startsWith('https://google')
      ? new Response('{"error":{"code":404}}', { status: 404 })
      : jsonResponse({ choices: [{ message: { content: 'من Groq' } }] });
  await withFetch(respond, async (reqs) => {
    assertEquals(await llm.chat({ messages: [{ role: 'user', content: 'سلام' }] }), 'من Groq');
    assertEquals(reqs.map((r) => new URL(r.url).host), ['google', 'groq']);
  });
});

Deno.test('speech-to-text over /audio/transcriptions', async () => {
  const stt = new OpenAICompatibleSTT('https://groq/v1', 'k', 'whisper-large-v3', 'ar');
  await withFetch(() => jsonResponse({ text: ' سلام عليكم ' }), async (reqs) => {
    assertEquals(await stt.transcribe(new Uint8Array([1]), 'audio/ogg; codecs=opus'), 'سلام عليكم');
    assertEquals(reqs[0].url, 'https://groq/v1/audio/transcriptions');
    assertEquals([reqs[0].form?.get('model'), reqs[0].form?.get('language')], ['whisper-large-v3', 'ar']);
    assertEquals((reqs[0].form?.get('file') as File).name, 'voice.ogg');
    assertEquals(reqs[0].form?.get('prompt'), null, 'no hint, no prompt');
  });
  await withFetch(() => jsonResponse({ text: 'سطات' }), async (reqs) => {
    await stt.transcribe(new Uint8Array([1]), 'audio/ogg', 3, 'شكاية، المدينة، سطات');
    assertEquals(reqs[0].form?.get('prompt'), 'شكاية، المدينة، سطات', 'the hint is sent as Whisper\'s prompt');
  });
  await withFetch(() => jsonResponse({}), async (reqs) => {
    assertEquals(await new OpenAICompatibleSTT('https://x', '', 'w').transcribe(new Uint8Array([1]), 'audio/x-unknown'), '');
    assertEquals(reqs[0].form?.get('language'), null);
  });
  await withFetch(() => new Response('down', { status: 503 }), async () => {
    assertEquals((await assertRejects(() => stt.transcribe(new Uint8Array([1]), 'audio/ogg'), LLMError)).retryable, true);
  });
});

Deno.test('a model that hears audio can transcribe', async () => {
  const llm = new OpenAICompatibleLLM({ baseUrl: 'https://g', apiKey: 'k', model: 'gemini-2.5-flash', caps: capabilitiesFor('gemini-2.5-flash') });
  await withFetch(() => jsonResponse({ choices: [{ message: { content: ' بغيت شكاية ' } }] }), async (reqs) => {
    assertEquals(await new LLMAudioSTT(llm).transcribe(new Uint8Array([1, 2]), 'audio/mpeg'), 'بغيت شكاية');
    const part = (reqs[0].json as { messages: { content: unknown }[] }).messages[1].content as { input_audio: { format: string } }[];
    assertEquals(part[0].input_audio.format, 'mp3');
    await new LLMAudioSTT(llm).transcribe(new Uint8Array([1]), 'audio/ogg', 2, 'فاس، مكناس');
    assertStringIncludes((reqs[1].json as { messages: { content: string }[] }).messages[0].content, 'فاس، مكناس');
  });
});

Deno.test('clipHint: spaces folded, cut at a word under the limit', () => {
  assertEquals(clipHint(undefined), '');
  assertEquals(clipHint('  فاس \n مكناس  '), 'فاس مكناس');
  assertEquals(clipHint('الرباط سلا تمارة', 10), 'الرباط');
  assertEquals(clipHint('الدارالبيضاء', 5), 'الدار', 'one long word: cut inside it');
});

Deno.test('FallbackSTT: the next transcriber takes over, the last error surfaces', async () => {
  const failing: SpeechToText = { transcribe: () => Promise.reject(new LLMError('whisper down', 503, true)) };
  const hints: (string | undefined)[] = [];
  const working: SpeechToText = { transcribe: (_a, _m, _s, hint) => (hints.push(hint), Promise.resolve('سلام')) };
  assertEquals(await new FallbackSTT([failing, working]).transcribe(new Uint8Array([1]), 'audio/ogg', 2, 'h'), 'سلام');
  assertEquals(hints, ['h'], 'the hint goes along');
  await assertRejects(() => new FallbackSTT([failing, failing]).transcribe(new Uint8Array([1]), 'audio/ogg'), LLMError, 'whisper down');
  assertEquals((() => { try { new FallbackSTT([]); return 'built'; } catch { return 'refused'; } })(), 'refused');
});

Deno.test('text-to-speech over /audio/speech', async () => {
  await withFetch(() => new Response(new Uint8Array([9])), async (reqs) => {
    const voice = await new OpenAICompatibleTTS('https://t', 'k', 'tts', 'nova').speak('مرحبا');
    assertEquals([voice.mime, voice.voice, voice.data], ['audio/ogg', true, new Uint8Array([9])]);
    assertEquals((reqs[0].json as { response_format: string }).response_format, 'opus');
    const mp3 = await new OpenAICompatibleTTS('https://t', '', 'tts', 'nova', 'mp3').speak('x');
    assertEquals([mp3.mime, mp3.voice], ['audio/mpeg', false]);
    assertEquals((await new OpenAICompatibleTTS('https://t', '', 'tts', 'nova', 'wav').speak('x')).mime, 'audio/wav');
  });
  await withFetch(() => new Response('no', { status: 400 }), async () => {
    await assertRejects(() => new OpenAICompatibleTTS('https://t', '', 'tts', 'v').speak('x'), LLMError);
  });
});

Deno.test('registry: speech providers from env, or the model itself, or none', () => {
  const env = (vars: Record<string, string>) => (n: string) => vars[n];
  const main = { LLM_BASE_URL: 'https://x', LLM_MODEL: 'llama-3.3-70b' };
  assertEquals(getSTT(env({ ...main, STT_BASE_URL: 'https://g', STT_MODEL: 'w' })) instanceof OpenAICompatibleSTT, true);
  const gemini = { LLM_BASE_URL: 'https://x', LLM_MODEL: 'gemini-2.5-flash' };
  assertEquals(getSTT(env({ ...gemini, STT_BASE_URL: 'https://g', STT_MODEL: 'w' })) instanceof FallbackSTT, true,
    'Whisper first, the model that hears audio as a fallback');
  assertEquals(getSTT(env({ STT_BASE_URL: 'https://g', STT_MODEL: 'w' })) instanceof OpenAICompatibleSTT, true, 'no model needed');
  assertEquals(getSTT(env({ LLM_BASE_URL: 'https://x', LLM_MODEL: 'gemini-2.5-flash' })) instanceof LLMAudioSTT, true);
  assertEquals(getSTT(env(main)), null);
  assertEquals(getTTS(env(main)), null);
  assertEquals(getTTS(env({ TTS_BASE_URL: 'https://t', TTS_MODEL: 'tts' })) instanceof OpenAICompatibleTTS, true);
});

Deno.test('document HTML, file names and renderers', async () => {
  const html = wrapDocumentHtml('<p>نص</p>', 'شكاية <b>');
  assertStringIncludes(html, '<title>شكاية b</title>');
  assertStringIncludes(html, 'size: A4');
  assertEquals(safeFilename('عقد: كراء/سكني?'), 'عقد كراءسكني');
  assertEquals(safeFilename('///'), 'document');

  const asHtml = await new HtmlFileRenderer().render('<p>x</p>', 'وثيقة');
  assertEquals([asHtml.filename, asHtml.mime], ['وثيقة.html', 'text/html']);

  await withFetch(() => new Response(new Uint8Array([37, 80, 68, 70])), async (reqs) => {
    const pdf = await new GotenbergRenderer('https://pdf.example/', 'user:pw').render('<p>x</p>', 'وثيقة');
    assertEquals([pdf.filename, pdf.mime, pdf.data.length], ['وثيقة.pdf', 'application/pdf', 4]);
    assertEquals(reqs[0].url, 'https://pdf.example/forms/chromium/convert/html');
    assertEquals((reqs[0].init.headers as Record<string, string>).Authorization, `Basic ${btoa('user:pw')}`);
  });
  await withFetch(() => new Response('chromium crashed', { status: 503 }), async () => {
    await assertRejects(() => new GotenbergRenderer('https://pdf.example').render('', 't'), Error, 'PDF service HTTP 503');
  });

  Deno.env.delete('PDF_SERVICE_URL');
  assertEquals(getRenderer() instanceof HtmlFileRenderer, true);
  Deno.env.set('PDF_SERVICE_URL', 'https://pdf.example');
  try {
    assertEquals(getRenderer() instanceof GotenbergRenderer, true);
  } finally {
    Deno.env.delete('PDF_SERVICE_URL');
  }
});
