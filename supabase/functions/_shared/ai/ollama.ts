// Ollama (https://ollama.com) through its native API, for models served on
// this machine, the local network, a dedicated GPU host, or Ollama's cloud.
//
// Why not only Ollama's OpenAI-compatible /v1 endpoint (which still works,
// with <ROLE>PROVIDER=openai)? The native /api/chat lets us:
//   - enforce the JSON schema of every task (`format`), on any model;
//   - size the context window (`options.num_ctx`): Ollama's default is small
//     and silently cuts long prompts such as a document's field list;
//   - keep the model loaded between messages (`keep_alive`), so users do not
//     wait for a cold load every time;
//   - turn "thinking" off for these short JSON tasks (`think`);
//   - ask the server what a model can do (/api/show: vision, tools).
//
// Configuration (per role, like every other model — see registry.ts):
//   LLM_BASE_URL=http://192.168.1.20:11434   (or https://ollama.my-host.ma, https://ollama.com)
//   LLM_MODEL=qwen2.5:14b
//   LLM_PROVIDER=ollama          (automatic for port 11434 and ollama.com)
//   LLM_API_KEY=...              (only behind a proxy that checks it, or for ollama.com)
//   LLM_HEADERS={"CF-Access-Client-Id":"...","CF-Access-Client-Secret":"..."}  (optional)
//   OLLAMA_NUM_CTX=8192  OLLAMA_KEEP_ALIVE=30m  OLLAMA_THINK=false   (optional, all Ollama models)

import { hostOf } from '../metrics/classify.ts';
import { type ApiReply, type ApiRequest, type EndpointConfig, joinUrl, OpenAICompatibleLLM, trimTrailingSlashes } from './openaiCompatible.ts';
import type { ChatMessage, ChatRequest, JsonSchema, ModelCapabilities } from './types.ts';

export const OLLAMA_PORT = '11434';
export const DEFAULT_KEEP_ALIVE = '30m';
export const DEFAULT_NUM_CTX = 8192;
/** Local models load from disk and may run on CPU: give them more time than cloud APIs. */
export const OLLAMA_TIMEOUT_MS = 120000;

export interface OllamaOptions {
  /** Context window in tokens (options.num_ctx). */
  numCtx?: number;
  /** How long the model stays in memory after a call, e.g. "30m", "-1" (forever), "0". */
  keepAlive?: string;
  /** false/true, or "low" | "medium" | "high" for models such as gpt-oss. Unset = model default. */
  think?: boolean | string;
}

/** Ollama's address without the /v1 or /api suffix people often copy. */
export function ollamaBase(url: string): string {
  let base = trimTrailingSlashes(url);
  for (const suffix of ['/v1', '/api']) {
    if (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  }
  return base;
}

/** Ollama's default port, or Ollama's own cloud. */
export function looksLikeOllama(url: string): boolean {
  try {
    const u = new URL(url);
    return u.port === OLLAMA_PORT || u.hostname === 'ollama.com' || u.hostname.endsWith('.ollama.com');
  } catch {
    return false;
  }
}

export function parseThink(value: string | undefined): boolean | string | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'true' || v === 'false') return v === 'true';
  return v;
}

// Ollama wants plain text per message and images as bare base64 next to it.
export function toOllamaMessages(messages: ChatMessage[]): { role: string; content: string; images?: string[] }[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    const texts: string[] = [];
    const images: string[] = [];
    for (const part of m.content) {
      if (part.type === 'text') texts.push(part.text);
      else if (part.type === 'image_url') images.push(part.image_url.url.slice(part.image_url.url.indexOf(',') + 1));
      // input_audio: Ollama has no audio input (caps.audioInput is false), so it is never sent.
    }
    return images.length ? { role: m.role, content: texts.join('\n'), images } : { role: m.role, content: texts.join('\n') };
  });
}

export class OllamaLLM extends OpenAICompatibleLLM {
  constructor(cfg: EndpointConfig, private readonly options: OllamaOptions = {}) {
    super({ ...cfg, baseUrl: ollamaBase(cfg.baseUrl), provider: cfg.provider ?? 'ollama' });
  }

  protected override request(req: ChatRequest, format: unknown): ApiRequest {
    const options: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2,
      num_ctx: this.options.numCtx ?? DEFAULT_NUM_CTX,
    };
    if (req.maxTokens) options.num_predict = req.maxTokens;
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: toOllamaMessages(req.messages),
      stream: false,
      options,
      keep_alive: this.options.keepAlive ?? DEFAULT_KEEP_ALIVE,
    };
    if (format) body.format = format;
    if (this.options.think !== undefined) body.think = this.options.think;
    return { path: 'api/chat', body };
  }

  protected override reply(data: any): ApiReply {
    const content = data?.message?.content;
    return {
      // A thinking model may spend its whole budget thinking: no answer is an empty reply.
      text: typeof content === 'string' && content.trim() ? content : null,
      inputTokens: data?.prompt_eval_count,
      outputTokens: data?.eval_count,
    };
  }

  // Ollama constrains decoding to the schema itself (any model), or to JSON.
  protected override responseFormat(schema: JsonSchema): unknown {
    if (this.caps.json === 'schema') return schema;
    if (this.caps.json === 'object') return 'json';
    return undefined;
  }
}

// --- capabilities from the server ---------------------------------------------------
// /api/show lists what a pulled model can do ("completion", "vision", "tools",
// "thinking"...). The result is cached for the life of the function instance,
// and failures for a few minutes, so a down server does not slow every message.

interface CacheEntry {
  caps: Partial<ModelCapabilities> | null;
  at: number;
}

const capsCache = new Map<string, CacheEntry>();
const FAILURE_TTL_MS = 5 * 60_000;
const SHOW_TIMEOUT_MS = 5000;

const cacheKey = (baseUrl: string, model: string) => `${ollamaBase(baseUrl)}\n${model}`;

export function capabilitiesFromShow(show: { capabilities?: unknown }): Partial<ModelCapabilities> | null {
  if (!Array.isArray(show?.capabilities)) return null;
  const list = new Set(show.capabilities.map(String));
  // Native structured output works on every completion model.
  return { vision: list.has('vision'), tools: list.has('tools'), json: 'schema', audioInput: false };
}

export interface ShowTarget {
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

/** POST /api/show; throws on HTTP or network errors. */
export async function showModel(t: ShowTarget, timeoutMs = SHOW_TIMEOUT_MS): Promise<any> {
  const res = await fetch(joinUrl(ollamaBase(t.baseUrl), 'api/show'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...t.headers, ...(t.apiKey && { Authorization: `Bearer ${t.apiKey}` }) },
    body: JSON.stringify({ model: t.model }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama /api/show ${res.status} on ${hostOf(t.baseUrl)}`);
  return await res.json();
}

/** Asks each server once what its model can do; later calls use the cache. Never throws. */
export async function detectOllamaCapabilities(targets: ShowTarget[], now = Date.now()): Promise<void> {
  await Promise.all(targets.map(async (t) => {
    const key = cacheKey(t.baseUrl, t.model);
    const hit = capsCache.get(key);
    if (hit && (hit.caps || now - hit.at < FAILURE_TTL_MS)) return;
    try {
      capsCache.set(key, { caps: capabilitiesFromShow(await showModel(t)), at: now });
    } catch (e) {
      console.warn(`[ai] could not read capabilities of ${t.model}: ${(e as Error).message}`);
      capsCache.set(key, { caps: null, at: now });
    }
  }));
}

export function detectedCapabilities(baseUrl: string, model: string): Partial<ModelCapabilities> | null {
  return capsCache.get(cacheKey(baseUrl, model))?.caps ?? null;
}

/** For tests. */
export function clearCapabilityCache(): void {
  capsCache.clear();
}
