// Run: npx deno test --allow-env supabase/functions/_shared

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { normalizeValue } from '../agent/normalize.ts';
import type { TemplateField } from '../agent/types.ts';
import { FallbackLLM } from './fallback.ts';
import { parseJsonReply } from './json.ts';
import { capabilitiesFor } from './models.ts';
import { OpenAICompatibleLLM } from './openaiCompatible.ts';
import { getLLM } from './registry.ts';
import type { LLM } from './types.ts';
import { LLMError } from './types.ts';

Deno.test('parseJsonReply tolerates fences and chatter', () => {
  assertEquals(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(parseJsonReply('Sure! Here it is: {"a": {"b": 2}} hope it helps'), { a: { b: 2 } });
});

Deno.test('capabilities: known prefix, provider prefix, env override, safe default', () => {
  assertEquals(capabilitiesFor('gemini-2.5-flash').json, 'schema');
  assertEquals(capabilitiesFor('google/gemini-2.5-flash').vision, true);
  assertEquals(capabilitiesFor('some-new-model'), { tools: false, json: 'none', vision: false, audioInput: false });
  assertEquals(capabilitiesFor('some-new-model', 'json_object,vision'), { tools: false, json: 'object', vision: true, audioInput: false });
});

Deno.test('registry: roles fall back to the main model; a role on another server needs its own key', () => {
  const env: Record<string, string> = {
    LLM_BASE_URL: 'https://main/v1', LLM_API_KEY: 'k', LLM_MODEL: 'gemini-2.5-flash',
    LLM_VISION_BASE_URL: 'http://localhost:11434/v1', LLM_VISION_MODEL: 'qwen2.5vl:7b',
  };
  const read = (n: string) => env[n];
  assertEquals(getLLM('fast', read).name, 'gemini-2.5-flash');
  assertEquals(getLLM('vision', read).name, 'qwen2.5vl:7b');
  env.LLM_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
  env.LLM_FALLBACK_BASE_URL = 'https://api.groq.com/openai/v1';
  assertEquals(getLLM('main', read).name, 'gemini-2.5-flash → llama-3.3-70b-versatile');
});

Deno.test('OpenAICompatibleLLM sends the standard request and retries bad JSON once', async () => {
  const bodies: any[] = [];
  const replies = ['not json at all', '{"ok": true}'];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const llm = new OpenAICompatibleLLM({ baseUrl: 'https://x/v1/', apiKey: 'k', model: 'm', caps: capabilitiesFor('gemini-x') });
    const out = await llm.json<{ ok: boolean }>({ messages: [{ role: 'user', content: 'hi' }] }, { type: 'object' }, 'test');
    assertEquals(out, { ok: true });
    assertEquals(bodies.length, 2);
    assertEquals(bodies[0].model, 'm');
    assertEquals(bodies[0].response_format.type, 'json_schema');
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test('FallbackLLM moves on only for retryable errors', async () => {
  const failing = (retryable: boolean): LLM => ({
    name: 'a', caps: capabilitiesFor('x'),
    chat: () => Promise.reject(new LLMError('down', 429, retryable)),
    json: () => Promise.reject(new LLMError('down', 429, retryable)),
  });
  const ok: LLM = { name: 'b', caps: capabilitiesFor('x'), chat: () => Promise.resolve('fine'), json: () => Promise.resolve({} as never) };
  assertEquals(await new FallbackLLM([failing(true), ok]).chat({ messages: [] }), 'fine');
  await assertRejects(() => new FallbackLLM([failing(false), ok]).chat({ messages: [] }), LLMError);
});

Deno.test('normalizeValue cleans what models and users write', () => {
  const f = (field_type: TemplateField['field_type'], options: string[] = []) =>
    ({ field_type, options, field_key: 'k', label_ar: '', placeholder_ar: '', is_required: true, sort_order: 0, field_id: '' }) as TemplateField;
  assertEquals(normalizeValue(f('cin'), 'g 754-103'), 'G754103');
  assertEquals(normalizeValue(f('phone'), '٠٦ ١٢ ٣٤ ٥٦ ٧٨'), '0612345678');
  assertEquals(normalizeValue(f('int'), '3 000 درهم'), '3000');
  assertEquals(normalizeValue(f('date'), '5/3/2026'), '2026-03-05');
  assertEquals(normalizeValue(f('select', ['الدار البيضاء']), 'الدارالبيضاء'), 'الدار البيضاء');
  assertEquals(normalizeValue(f('varchar'), { not: 'text' }), '');
});
