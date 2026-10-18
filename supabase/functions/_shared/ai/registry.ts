// The only place that reads AI configuration. Every role needs at most three
// variables, and each falls back to the main model's:
//
//   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL [/ LLM_CAPS]          main (required)
//   LLM_VISION_BASE_URL / ..._API_KEY / ..._MODEL [/ ..._CAPS]   images (optional)
//   LLM_FAST_BASE_URL   / ..._API_KEY / ..._MODEL [/ ..._CAPS]   cheap steps (optional)
//   LLM_FALLBACK_BASE_URL / ..._API_KEY / ..._MODEL [/ ..._CAPS] used on 429/5xx (optional)
//   STT_BASE_URL / STT_API_KEY / STT_MODEL [/ STT_LANGUAGE]      speech-to-text (optional)
//   TTS_BASE_URL / TTS_API_KEY / TTS_MODEL / TTS_VOICE [/ TTS_FORMAT]  voice replies (optional)
//
// Each LLM role may also set <ROLE>PROVIDER (openai | ollama; automatic: Ollama
// for port 11434 and ollama.com) and <ROLE>HEADERS (a JSON object of extra
// HTTP headers). Ollama-wide: OLLAMA_NUM_CTX, OLLAMA_KEEP_ALIVE, OLLAMA_THINK.

import { hostOf, providerOf } from '../metrics/classify.ts';
import type { CallObserver } from '../metrics/types.ts';
import { FallbackLLM } from './fallback.ts';
import { capabilitiesFor } from './models.ts';
import {
  detectedCapabilities, detectOllamaCapabilities, looksLikeOllama, OLLAMA_TIMEOUT_MS, OllamaLLM, type OllamaOptions, parseThink,
  type ShowTarget,
} from './ollama.ts';
import { OpenAICompatibleLLM } from './openaiCompatible.ts';
import { FallbackSTT, LLMAudioSTT, OpenAICompatibleSTT, OpenAICompatibleTTS } from './speech.ts';
import type { LLM, ModelCapabilities, SpeechToText, TextToSpeech } from './types.ts';

export type EnvReader = (name: string) => string | undefined;
export type Role = 'main' | 'vision' | 'fast';

const denoEnv: EnvReader = (name) => Deno.env.get(name);

export type ApiKind = 'openai' | 'ollama';

export interface ResolvedEndpoint {
  kind: ApiKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  caps: ModelCapabilities;
  /** Extra HTTP headers (values are secrets: never shown). */
  headers: Record<string, string>;
  /** True when the role has its own model or server (otherwise it uses the main one). */
  own: boolean;
}

/** `{"Name": "value"}` from <ROLE>HEADERS; invalid JSON is reported and ignored. */
export function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  } catch (e) {
    console.warn(`[ai] ignoring *_HEADERS: expected a JSON object (${(e as Error).message})`);
    return {};
  }
}

export function apiKindFor(declared: string | undefined, baseUrl: string): ApiKind {
  const d = (declared ?? '').trim().toLowerCase();
  if (d === 'ollama') return 'ollama';
  if (d === 'openai' || d) return 'openai';
  return looksLikeOllama(baseUrl) ? 'ollama' : 'openai';
}

export function resolveEndpoint(env: EnvReader, prefix: string): ResolvedEndpoint | null {
  const model = env(`${prefix}MODEL`) || env('LLM_MODEL');
  const baseUrl = env(`${prefix}BASE_URL`) || env('LLM_BASE_URL');
  if (!model || !baseUrl) return null;
  // A role that names its own server brings its own key, headers and dialect;
  // otherwise it inherits the main server's.
  const ownServer = !!env(`${prefix}BASE_URL`);
  const inherited = (name: string) => (ownServer ? env(`${prefix}${name}`) : env(`${prefix}${name}`) ?? env(`LLM_${name}`));
  const kind = apiKindFor(inherited('PROVIDER'), baseUrl);
  const declaredCaps = env(`${prefix}CAPS`) ?? (prefix === 'LLM_' ? undefined : env('LLM_CAPS'));
  return {
    kind,
    baseUrl,
    apiKey: inherited('API_KEY') ?? '',
    model,
    caps: capsFor(kind, baseUrl, model, declaredCaps),
    headers: parseHeaders(inherited('HEADERS')),
    own: prefix === 'LLM_' || !!(env(`${prefix}MODEL`) || ownServer),
  };
}

// Declared (<ROLE>CAPS) > reported by the Ollama server > known model table.
// Every Ollama model gets native JSON-schema output.
function capsFor(kind: ApiKind, baseUrl: string, model: string, declared: string | undefined): ModelCapabilities {
  if (declared?.trim()) return capabilitiesFor(model, declared);
  const known = capabilitiesFor(model);
  if (kind !== 'ollama') return known;
  return { ...known, json: 'schema', audioInput: false, ...detectedCapabilities(baseUrl, model) };
}

export function ollamaOptions(env: EnvReader): OllamaOptions {
  return {
    numCtx: Number(env('OLLAMA_NUM_CTX')) || undefined,
    keepAlive: env('OLLAMA_KEEP_ALIVE') || undefined,
    think: parseThink(env('OLLAMA_THINK')),
  };
}

function endpoint(env: EnvReader, prefix: string, role: string, observe?: CallObserver) {
  const e = resolveEndpoint(env, prefix);
  if (!e) return null;
  const cfg = {
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
    model: e.model,
    caps: e.caps,
    headers: e.headers,
    timeoutMs: Number(env('LLM_TIMEOUT_MS')) || (e.kind === 'ollama' ? OLLAMA_TIMEOUT_MS : 45000),
    retries: env('LLM_RETRIES') === undefined ? undefined : Number(env('LLM_RETRIES')),
    observe,
    role,
  };
  return e.kind === 'ollama' ? new OllamaLLM(cfg, ollamaOptions(env)) : new OpenAICompatibleLLM(cfg);
}

/** Every Ollama model configured for a role (main, vision, fast, fallback). */
export function ollamaTargets(env: EnvReader = denoEnv): ShowTarget[] {
  const prefixes = [...Object.values(ROLE_PREFIX), ...(env('LLM_FALLBACK_MODEL') ? ['LLM_FALLBACK_'] : [])];
  return prefixes
    .map((p) => resolveEndpoint(env, p))
    .filter((e): e is ResolvedEndpoint => e?.kind === 'ollama')
    .map((e) => ({ baseUrl: e.baseUrl, model: e.model, apiKey: e.apiKey, headers: e.headers }));
}

/**
 * Reads what each Ollama model can do (vision, tools) before the first message,
 * so getLLM() routes images correctly without a CAPS variable. Cached; never throws.
 */
export function prepareModels(env: EnvReader = denoEnv): Promise<void> {
  return detectOllamaCapabilities(ollamaTargets(env));
}

export const ROLE_PREFIX: Record<Role, string> = { main: 'LLM_', vision: 'LLM_VISION_', fast: 'LLM_FAST_' };

/** `observe` receives one telemetry event per HTTP attempt (see _shared/metrics). */
export function getLLM(role: Role = 'main', env: EnvReader = denoEnv, observe?: CallObserver): LLM {
  const primary = endpoint(env, ROLE_PREFIX[role], role, observe);
  if (!primary) throw new Error('AI is not configured: set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY unless the server is local).');
  const fallback = env('LLM_FALLBACK_MODEL') ? endpoint(env, 'LLM_FALLBACK_', 'fallback', observe) : null;
  return fallback ? new FallbackLLM([primary, fallback]) : primary;
}

/**
 * Speech-to-text: the STT_* endpoint (Whisper...), then the main model when it
 * hears audio, as a fallback when the endpoint fails (or alone without one).
 */
export function getSTT(env: EnvReader = denoEnv, observe?: CallObserver): SpeechToText | null {
  const model = env('STT_MODEL');
  const baseUrl = env('STT_BASE_URL');
  const chain: SpeechToText[] = [];
  if (model && baseUrl) chain.push(new OpenAICompatibleSTT(baseUrl, env('STT_API_KEY') ?? '', model, env('STT_LANGUAGE'), observe));
  const main = mainIfConfigured(env, observe);
  if (main?.caps.audioInput) chain.push(new LLMAudioSTT(main));
  if (chain.length > 1) return new FallbackSTT(chain);
  return chain[0] ?? null;
}

function mainIfConfigured(env: EnvReader, observe?: CallObserver): LLM | null {
  try {
    return getLLM('main', env, observe);
  } catch {
    return null; // no model configured: speech-to-text may still work through its own endpoint
  }
}

export function getTTS(env: EnvReader = denoEnv, observe?: CallObserver): TextToSpeech | null {
  const model = env('TTS_MODEL');
  const baseUrl = env('TTS_BASE_URL');
  if (!model || !baseUrl) return null;
  return new OpenAICompatibleTTS(baseUrl, env('TTS_API_KEY') ?? '', model, env('TTS_VOICE') || 'alloy', env('TTS_FORMAT') || 'opus',
    observe);
}

// --- What is configured, for the admin dashboard (agent-status). No secrets. ---

export interface EndpointInfo {
  role: string;
  kind: ApiKind;
  provider: string;
  host: string;
  model: string;
  hasKey: boolean;
  /** Names of the extra headers; their values are never shown. */
  headerNames: string[];
  own: boolean;
  caps: ModelCapabilities;
}

export interface AiConfigInfo {
  roles: EndpointInfo[];
  stt: { mode: 'endpoint' | 'main-model' | 'none'; provider?: string; host?: string; model?: string; hasKey?: boolean };
  tts: { configured: boolean; provider?: string; host?: string; model?: string; hasKey?: boolean };
  retries: number;
  timeoutMs: number;
  /** Settings applied to every Ollama model, when one is configured. */
  ollama: OllamaOptions | null;
}

function info(env: EnvReader, prefix: string, role: string): EndpointInfo | null {
  const e = resolveEndpoint(env, prefix);
  if (!e) return null;
  return {
    role, kind: e.kind, provider: e.kind === 'ollama' ? 'ollama' : providerOf(e.baseUrl), host: hostOf(e.baseUrl), model: e.model,
    hasKey: !!e.apiKey, headerNames: Object.keys(e.headers), own: e.own, caps: e.caps,
  };
}

function sttInfo(env: EnvReader, main: EndpointInfo | null): AiConfigInfo['stt'] {
  const model = env('STT_MODEL');
  const baseUrl = env('STT_BASE_URL');
  if (model && baseUrl) return { mode: 'endpoint', provider: providerOf(baseUrl), host: hostOf(baseUrl), model, hasKey: !!env('STT_API_KEY') };
  if (main?.caps.audioInput) return { mode: 'main-model', provider: main.provider, host: main.host, model: main.model, hasKey: main.hasKey };
  return { mode: 'none' };
}

export function describeAiConfig(env: EnvReader = denoEnv): AiConfigInfo {
  const roles = (Object.keys(ROLE_PREFIX) as Role[]).map((r) => info(env, ROLE_PREFIX[r], r));
  if (env('LLM_FALLBACK_MODEL')) roles.push(info(env, 'LLM_FALLBACK_', 'fallback'));
  const ttsModel = env('TTS_MODEL');
  const ttsUrl = env('TTS_BASE_URL');
  const configured = roles.filter((r): r is EndpointInfo => !!r);
  const anyOllama = configured.some((r) => r.kind === 'ollama');
  return {
    roles: configured,
    stt: sttInfo(env, roles[0]),
    tts: ttsModel && ttsUrl
      ? { configured: true, provider: providerOf(ttsUrl), host: hostOf(ttsUrl), model: ttsModel, hasKey: !!env('TTS_API_KEY') }
      : { configured: false },
    retries: env('LLM_RETRIES') === undefined ? 2 : Number(env('LLM_RETRIES')),
    timeoutMs: Number(env('LLM_TIMEOUT_MS')) || (configured[0]?.kind === 'ollama' ? OLLAMA_TIMEOUT_MS : 45000),
    ollama: anyOllama ? ollamaOptions(env) : null,
  };
}
