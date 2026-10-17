import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import { FallbackLLM } from './fallback.ts';
import { capabilitiesFor, parseCaps, SAFE_DEFAULTS } from './models.ts';
import type { ChatRequest, LLM } from './types.ts';
import { LLMError } from './types.ts';

const REQ: ChatRequest = { messages: [{ role: 'user', content: 'سلام' }] } as ChatRequest;

function model(name: string, outcome: () => unknown): LLM {
  const run = () => Promise.resolve().then(outcome);
  return {
    name,
    caps: { tools: true, json: 'schema', vision: true, audioInput: true },
    chat: () => run() as Promise<string>,
    json: <T>() => run() as Promise<T>,
  };
}

Deno.test('FallbackLLM: needs at least one model', () => {
  assertThrows(() => new FallbackLLM([]), Error, 'at least one model');
});

Deno.test('FallbackLLM: json() falls back too, and the last error surfaces when all fail', async () => {
  const busy = () => {
    throw new LLMError('rate limited', 429, true);
  };
  const ok = new FallbackLLM([model('a', busy), model('b', () => ({ ok: 1 }))]);
  assertEquals(await ok.json({ ...REQ }, { type: 'object' }, 'x'), { ok: 1 });

  const allDown = new FallbackLLM([
    model('a', busy),
    model('b', () => {
      throw new LLMError('down', 503, true);
    }),
  ]);
  await assertRejects(() => allDown.json(REQ, { type: 'object' }, 'x'), LLMError, 'down');
  await assertRejects(() => allDown.chat(REQ), LLMError, 'down');
});

Deno.test('FallbackLLM: a non-LLM error is thrown at once (no fallback)', async () => {
  let secondCalled = false;
  const llm = new FallbackLLM([
    model('a', () => {
      throw new TypeError('bug');
    }),
    model('b', () => {
      secondCalled = true;
      return 'x';
    }),
  ]);
  await assertRejects(() => llm.chat(REQ), TypeError, 'bug');
  assertEquals(secondCalled, false);
});

Deno.test('parseCaps: JSON modes and other tokens', () => {
  assertEquals(parseCaps('json_schema, vision'), { tools: false, json: 'schema', vision: true, audioInput: false });
  assertEquals(parseCaps('JSON_OBJECT tools audio'), { tools: true, json: 'object', vision: false, audioInput: true });
  assertEquals(parseCaps('vision'), { tools: false, json: 'none', vision: true, audioInput: false });
});

Deno.test('capabilitiesFor: override, provider prefix, unknown model', () => {
  assertEquals(capabilitiesFor('gemini-2.5-flash', 'json_object').json, 'object', 'override wins');
  assertEquals(capabilitiesFor('meta-llama/llama-4-scout').vision, true, 'provider prefix ignored');
  assertEquals(capabilitiesFor('some-new-model'), SAFE_DEFAULTS);
  assertEquals(capabilitiesFor('', '  '), SAFE_DEFAULTS, 'blank override is ignored');
});
