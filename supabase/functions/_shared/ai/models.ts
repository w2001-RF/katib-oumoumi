import type { ModelCapabilities } from './types.ts';

// Capabilities of models we have tried, matched by prefix of the model name
// (provider prefixes such as "google/" or "meta-llama/" are ignored).
// An unknown model gets SAFE_DEFAULTS; declare more with the <ROLE>CAPS
// environment variable instead of editing this file, e.g.
//   LLM_CAPS=json_schema,vision,tools
const KNOWN: [prefix: string, caps: ModelCapabilities][] = [
  ['gemini-', { tools: true, json: 'schema', vision: true, audioInput: true }],
  ['gemma-3', { tools: false, json: 'object', vision: true, audioInput: false }],
  // Ollama names ("gemma3:12b", "qwen3:8b"...); Ollama also reports them itself (see ollama.ts).
  ['gemma3', { tools: false, json: 'object', vision: true, audioInput: false }],
  ['qwen3', { tools: true, json: 'object', vision: false, audioInput: false }],
  ['llava', { tools: false, json: 'object', vision: true, audioInput: false }],
  ['minicpm-v', { tools: false, json: 'object', vision: true, audioInput: false }],
  ['mistral-small3', { tools: true, json: 'object', vision: true, audioInput: false }],
  ['granite3.2-vision', { tools: false, json: 'object', vision: true, audioInput: false }],
  ['gpt-oss', { tools: true, json: 'object', vision: false, audioInput: false }],
  ['claude-', { tools: true, json: 'none', vision: true, audioInput: false }],
  ['gpt-4o', { tools: true, json: 'schema', vision: true, audioInput: false }],
  ['gpt-4.1', { tools: true, json: 'schema', vision: true, audioInput: false }],
  ['gpt-5', { tools: true, json: 'schema', vision: true, audioInput: false }],
  ['llama-3.3', { tools: true, json: 'object', vision: false, audioInput: false }],
  ['llama-4', { tools: true, json: 'object', vision: true, audioInput: false }],
  ['llama3.2-vision', { tools: false, json: 'object', vision: true, audioInput: false }],
  ['qwen2.5vl', { tools: false, json: 'object', vision: true, audioInput: false }],
  ['qwen', { tools: true, json: 'object', vision: false, audioInput: false }],
  ['mistral', { tools: true, json: 'object', vision: false, audioInput: false }],
  ['atlas-chat', { tools: false, json: 'none', vision: false, audioInput: false }],
];

export const SAFE_DEFAULTS: ModelCapabilities = { tools: false, json: 'none', vision: false, audioInput: false };

export function capabilitiesFor(model: string, override?: string): ModelCapabilities {
  if (override?.trim()) return parseCaps(override);
  const name = model.toLowerCase().split('/').pop() || '';
  const hit = KNOWN.find(([prefix]) => name.startsWith(prefix));
  return hit ? { ...hit[1] } : { ...SAFE_DEFAULTS };
}

function jsonMode(tokens: Set<string>): ModelCapabilities['json'] {
  if (tokens.has('json_schema')) return 'schema';
  if (tokens.has('json_object')) return 'object';
  return 'none';
}

// "json_schema,vision" -> capabilities. Tokens: tools, json_schema, json_object, vision, audio.
export function parseCaps(list: string): ModelCapabilities {
  const t = new Set(list.toLowerCase().split(/[\s,]+/).filter(Boolean));
  return {
    tools: t.has('tools'),
    json: jsonMode(t),
    vision: t.has('vision'),
    audioInput: t.has('audio'),
  };
}
