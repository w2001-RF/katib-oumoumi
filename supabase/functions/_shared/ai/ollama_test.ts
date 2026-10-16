// Ollama's native API against a scripted server.
// Run: npx deno test --config tests/deno.json --allow-env supabase/functions
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { jsonResponse, withFetch } from '../testing/fakeFetch.ts';
import type { ServiceCallEvent } from '../metrics/types.ts';
import { capabilitiesFor } from './models.ts';
import {
  capabilitiesFromShow, clearCapabilityCache, detectedCapabilities, detectOllamaCapabilities, looksLikeOllama, ollamaBase,
  OllamaLLM, parseThink, toOllamaMessages,
} from './ollama.ts';
import { OpenAICompatibleLLM } from './openaiCompatible.ts';
import { apiKindFor, describeAiConfig, getLLM, ollamaTargets, parseHeaders, prepareModels, resolveEndpoint } from './registry.ts';
import { LLMError } from './types.ts';

const ollamaReply = (content: string, extra: Record<string, unknown> = {}) =>
  jsonResponse({ model: 'qwen2.5:14b', message: { role: 'assistant', content }, done: true, prompt_eval_count: 812, eval_count: 41, ...extra });

const env = (vars: Record<string, string>) => (n: string) => vars[n];

Deno.test('Ollama URLs, dialect detection, think and header settings', () => {
  assertEquals(ollamaBase('http://192.168.1.20:11434/v1/'), 'http://192.168.1.20:11434');
  assertEquals(ollamaBase('https://ollama.my-host.ma/api'), 'https://ollama.my-host.ma');
  assertEquals(ollamaBase('http://localhost:11434'), 'http://localhost:11434');
  assertEquals([looksLikeOllama('http://10.0.0.5:11434/v1'), looksLikeOllama('https://ollama.com'), looksLikeOllama('https://api.groq.com/openai/v1'),
    looksLikeOllama('nope')], [true, true, false, false]);
  assertEquals([apiKindFor(undefined, 'http://h:11434'), apiKindFor('openai', 'http://h:11434'), apiKindFor('OLLAMA', 'https://gpu.example.com'),
    apiKindFor('vllm', 'http://h:8000/v1')], ['ollama', 'openai', 'ollama', 'openai']);
  assertEquals([parseThink(undefined), parseThink('false'), parseThink('TRUE'), parseThink('low'), parseThink(' ')], [undefined, false, true, 'low', undefined]);
  assertEquals(parseHeaders('{"CF-Access-Client-Id":"id","X-Num":3}'), { 'CF-Access-Client-Id': 'id', 'X-Num': '3' });
  assertEquals([parseHeaders(undefined), parseHeaders('not json'), parseHeaders('["a"]'), parseHeaders('null')], [{}, {}, {}, {}]);
});

Deno.test('messages: text parts joined, images as bare base64, audio never sent', () => {
  assertEquals(toOllamaMessages([
    { role: 'system', content: 'rules' },
    { role: 'user', content: [
      { type: 'text', text: 'هادي البطاقة' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
      { type: 'text', text: 'شوف' },
      { type: 'input_audio', input_audio: { data: 'AAA', format: 'ogg' } },
    ] },
    { role: 'user', content: [{ type: 'text', text: 'only text' }] },
  ]), [
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'هادي البطاقة\nشوف', images: ['QUJD'] },
    { role: 'user', content: 'only text' },
  ]);
});

Deno.test('native /api/chat: schema format, context, keep-alive, think, headers, tokens', async () => {
  const events: ServiceCallEvent[] = [];
  const llm = new OllamaLLM({
    baseUrl: 'https://ollama.my-host.ma/v1', apiKey: 'proxy-key', model: 'qwen2.5:14b', caps: { ...capabilitiesFor('qwen2.5:14b'), json: 'schema' },
    headers: { 'CF-Access-Client-Id': 'cf-id' }, observe: (e) => events.push(e), role: 'main',
  }, { numCtx: 16384, keepAlive: '-1', think: false });
  const schema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };
  await withFetch(() => ollamaReply('{"text":"شنو سميتك؟"}'), async (reqs) => {
    assertEquals(await llm.json({ messages: [{ role: 'user', content: 'سلام' }], maxTokens: 200 }, schema, 'question'), { text: 'شنو سميتك؟' });
    const req = reqs[0];
    assertEquals(req.url, 'https://ollama.my-host.ma/api/chat');
    const body = req.json as Record<string, any>;
    assertEquals([body.model, body.stream, body.format, body.keep_alive, body.think], ['qwen2.5:14b', false, schema, '-1', false]);
    assertEquals(body.options, { temperature: 0.2, num_ctx: 16384, num_predict: 200 });
    assertEquals(req.init.headers, { 'Content-Type': 'application/json', 'CF-Access-Client-Id': 'cf-id', Authorization: 'Bearer proxy-key' });
  });
  assertEquals(events.map((e) => [e.provider, e.role, e.task, e.ok, e.inputTokens, e.outputTokens]), [['ollama', 'main', 'question', true, 812, 41]]);

  // Defaults: 8k context, kept 30 minutes, the model's own thinking setting, plain JSON mode.
  const plain = new OllamaLLM({ baseUrl: 'http://localhost:11434', apiKey: '', model: 'm', caps: { ...capabilitiesFor('m'), json: 'object' } });
  await withFetch(() => ollamaReply('{"a":1}'), async (reqs) => {
    await plain.json({ messages: [] }, {}, 'x');
    const body = reqs[0].json as Record<string, any>;
    assertEquals([body.options.num_ctx, body.keep_alive, 'think' in body, body.format], [8192, '30m', false, 'json']);
    assertEquals(reqs[0].init.headers, { 'Content-Type': 'application/json' });
  });
  const free = new OllamaLLM({ baseUrl: 'http://localhost:11434', apiKey: '', model: 'm', caps: capabilitiesFor('m') });
  await withFetch(() => ollamaReply('hello'), async (reqs) => {
    assertEquals(await free.chat({ messages: [] }), 'hello');
    assertEquals('format' in (reqs[0].json as object), false);
  });
});

Deno.test('Ollama errors: model not pulled, only thinking, server down', async () => {
  const llm = new OllamaLLM({ baseUrl: 'http://localhost:11434', apiKey: '', model: 'qwen3:8b', caps: capabilitiesFor('qwen3:8b'), retries: 0 });
  await withFetch(() => jsonResponse({ error: "model 'qwen3:8b' not found, try pulling it first" }, 404), async () => {
    const e = await assertRejects(() => llm.chat({ messages: [] }), LLMError);
    assertEquals([e.status, e.retryable], [404, true]);
    assert(e.message.includes('try pulling it first'));
  });
  await withFetch(() => ollamaReply('', { message: { role: 'assistant', content: '', thinking: 'hmm…' } }), async () => {
    await assertRejects(() => llm.chat({ messages: [] }), LLMError, 'Empty reply');
  });
  await withFetch(() => Promise.reject(new TypeError('Connection refused (os error 111)')), async () => {
    const e = await assertRejects(() => llm.chat({ messages: [] }), LLMError);
    assertEquals(e.transient, true, 'a stopped server makes the bot say "busy, resend"');
  });
});

Deno.test('capabilities read from /api/show, cached, failures retried later', async () => {
  clearCapabilityCache();
  assertEquals(capabilitiesFromShow({ capabilities: ['completion', 'vision'] }), { vision: true, tools: false, json: 'schema', audioInput: false });
  assertEquals(capabilitiesFromShow({}), null);

  const target = { baseUrl: 'http://gpu.lan:11434/v1', model: 'gemma3:12b', headers: { 'X-Token': 't' }, apiKey: 'k' };
  await withFetch(() => jsonResponse({ capabilities: ['completion', 'vision', 'tools'] }), async (reqs) => {
    await detectOllamaCapabilities([target], 1000);
    await detectOllamaCapabilities([target], 2000);
    assertEquals(reqs.length, 1, 'asked once');
    assertEquals(reqs[0].url, 'http://gpu.lan:11434/api/show');
    assertEquals(reqs[0].json, { model: 'gemma3:12b' });
    assertEquals(reqs[0].init.headers, { 'Content-Type': 'application/json', 'X-Token': 't', Authorization: 'Bearer k' });
  });
  assertEquals(detectedCapabilities('http://gpu.lan:11434', 'gemma3:12b'), { vision: true, tools: true, json: 'schema', audioInput: false });

  const down = { baseUrl: 'http://off.lan:11434', model: 'x' };
  await withFetch(() => new Response('no', { status: 502 }), async (reqs) => {
    await detectOllamaCapabilities([down], 0);
    await detectOllamaCapabilities([down], 60_000);
    assertEquals(reqs.length, 1, 'a failure is not retried for 5 minutes');
    await detectOllamaCapabilities([down], 6 * 60_000);
    assertEquals(reqs.length, 2);
  });
  assertEquals(detectedCapabilities('http://off.lan:11434', 'x'), null);
});

Deno.test('registry: Ollama per role, inherited key/headers/dialect, detected capabilities', async () => {
  clearCapabilityCache();
  const vars = {
    LLM_BASE_URL: 'http://192.168.1.20:11434/v1', LLM_MODEL: 'qwen2.5:14b', LLM_HEADERS: '{"X-Lan":"1"}',
    LLM_VISION_MODEL: 'gemma3:12b',
    LLM_FALLBACK_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/', LLM_FALLBACK_API_KEY: 'g', LLM_FALLBACK_MODEL: 'gemini-3.8-flash',
    OLLAMA_NUM_CTX: '16384', OLLAMA_THINK: 'false',
  };
  const main = resolveEndpoint(env(vars), 'LLM_')!;
  assertEquals([main.kind, main.caps.json, main.caps.vision, main.headers], ['ollama', 'schema', false, { 'X-Lan': '1' }]);
  const vision = resolveEndpoint(env(vars), 'LLM_VISION_')!;
  assertEquals([vision.kind, vision.caps.vision, vision.headers, vision.own], ['ollama', true, { 'X-Lan': '1' }, true], 'inherits the main server');
  const fallback = resolveEndpoint(env(vars), 'LLM_FALLBACK_')!;
  assertEquals([fallback.kind, fallback.headers], ['openai', {}], 'its own server: nothing inherited');
  assertEquals(resolveEndpoint(env({ ...vars, LLM_PROVIDER: 'openai' }), 'LLM_')!.kind, 'openai', 'opt out of the native API');
  assertEquals(resolveEndpoint(env({ ...vars, LLM_CAPS: 'json_object' }), 'LLM_')!.caps.json, 'object', 'declared caps win');

  assertEquals(ollamaTargets(env(vars)).map((t) => t.model), ['qwen2.5:14b', 'gemma3:12b', 'qwen2.5:14b']);
  // The server says qwen2.5 reads images too: the main role then accepts photos without LLM_CAPS.
  await withFetch(() => jsonResponse({ capabilities: ['completion', 'vision'] }), () => prepareModels(env(vars)));
  assertEquals(resolveEndpoint(env(vars), 'LLM_')!.caps.vision, true);

  const llm = getLLM('main', env({ ...vars, LLM_FALLBACK_MODEL: '' }));
  assert(llm instanceof OllamaLLM);
  await withFetch(() => ollamaReply('ok'), async (reqs) => {
    await llm.chat({ messages: [] });
    const body = reqs[0].json as Record<string, any>;
    assertEquals([reqs[0].url, body.options.num_ctx, body.think], ['http://192.168.1.20:11434/api/chat', 16384, false]);
  });
  assert(getLLM('main', env({ LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'x' })) instanceof OpenAICompatibleLLM);

  const info = describeAiConfig(env({ ...vars, LLM_API_KEY: 'SECRET' }));
  assertEquals(info.roles.map((r) => [r.role, r.kind, r.provider, r.headerNames]), [
    ['main', 'ollama', 'ollama', ['X-Lan']], ['vision', 'ollama', 'ollama', ['X-Lan']], ['fast', 'ollama', 'ollama', ['X-Lan']],
    ['fallback', 'openai', 'google', []],
  ]);
  assertEquals([info.timeoutMs, info.ollama], [120000, { numCtx: 16384, keepAlive: undefined, think: false }]);
  assert(!JSON.stringify(info).includes('SECRET'));
  assertEquals(describeAiConfig(env({ LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'x' })).ollama, null);
  clearCapabilityCache();
});
