// The only place that reads AI configuration. Every role needs at most three
// variables, and each falls back to the main model's:
//
//   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL [/ LLM_CAPS]          main (required)
//   LLM_VISION_BASE_URL / ..._API_KEY / ..._MODEL [/ ..._CAPS]   images (optional)
//   LLM_FAST_BASE_URL   / ..._API_KEY / ..._MODEL [/ ..._CAPS]   cheap steps (optional)
//   LLM_FALLBACK_BASE_URL / ..._API_KEY / ..._MODEL [/ ..._CAPS] used on 429/5xx (optional)
//   STT_BASE_URL / STT_API_KEY / STT_MODEL [/ STT_LANGUAGE]      speech-to-text (optional)
//   TTS_BASE_URL / TTS_API_KEY / TTS_MODEL / TTS_VOICE [/ TTS_FORMAT]  voice replies (optional)

import { hostOf, providerOf } from '../metrics/classify.ts';
import type { CallObserver } from '../metrics/types.ts';
import { FallbackLLM } from './fallback.ts';
import { capabilitiesFor } from './models.ts';
import { OpenAICompatibleLLM } from './openaiCompatible.ts';
import { LLMAudioSTT, OpenAICompatibleSTT, OpenAICompatibleTTS } from './speech.ts';
import type { LLM, ModelCapabilities, SpeechToText, TextToSpeech } from './types.ts';

export type EnvReader = (name: string) => string | undefined;
export type Role = 'main' | 'vision' | 'fast';

const denoEnv: EnvReader = (name) => Deno.env.get(name);

export interface ResolvedEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  caps: ModelCapabilities;
  /** True when the role has its own model or server (otherwise it uses the main one). */
  own: boolean;
}

export function resolveEndpoint(env: EnvReader, prefix: string): ResolvedEndpoint | null {
  const model = env(`${prefix}MODEL`) || env('LLM_MODEL');
  const baseUrl = env(`${prefix}BASE_URL`) || env('LLM_BASE_URL');
  if (!model || !baseUrl) return null;
  // A role that names its own server must also bring its own key.
  const apiKey = env(`${prefix}BASE_URL`) ? env(`${prefix}API_KEY`) ?? '' : env(`${prefix}API_KEY`) ?? env('LLM_API_KEY') ?? '';
  const caps = capabilitiesFor(model, env(`${prefix}CAPS`) ?? (prefix === 'LLM_' ? undefined : env('LLM_CAPS')));
  return { baseUrl, apiKey, model, caps, own: prefix === 'LLM_' || !!(env(`${prefix}MODEL`) || env(`${prefix}BASE_URL`)) };
}

function endpoint(env: EnvReader, prefix: string, role: string, observe?: CallObserver) {
  const e = resolveEndpoint(env, prefix);
  if (!e) return null;
  return new OpenAICompatibleLLM({
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
    model: e.model,
    caps: e.caps,
    timeoutMs: Number(env('LLM_TIMEOUT_MS')) || 45000,
    retries: env('LLM_RETRIES') === undefined ? undefined : Number(env('LLM_RETRIES')),
    observe,
    role,
  });
}

export const ROLE_PREFIX: Record<Role, string> = { main: 'LLM_', vision: 'LLM_VISION_', fast: 'LLM_FAST_' };

/** `observe` receives one telemetry event per HTTP attempt (see _shared/metrics). */
export function getLLM(role: Role = 'main', env: EnvReader = denoEnv, observe?: CallObserver): LLM {
  const primary = endpoint(env, ROLE_PREFIX[role], role, observe);
  if (!primary) throw new Error('AI is not configured: set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY unless the server is local).');
  const fallback = env('LLM_FALLBACK_MODEL') ? endpoint(env, 'LLM_FALLBACK_', 'fallback', observe) : null;
  return fallback ? new FallbackLLM([primary, fallback]) : primary;
}

export function getSTT(env: EnvReader = denoEnv, observe?: CallObserver): SpeechToText | null {
  const model = env('STT_MODEL');
  const baseUrl = env('STT_BASE_URL');
  if (model && baseUrl) return new OpenAICompatibleSTT(baseUrl, env('STT_API_KEY') ?? '', model, env('STT_LANGUAGE'), observe);
  const main = getLLM('main', env, observe);
  return main.caps.audioInput ? new LLMAudioSTT(main) : null;
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
  provider: string;
  host: string;
  model: string;
  hasKey: boolean;
  own: boolean;
  caps: ModelCapabilities;
}

export interface AiConfigInfo {
  roles: EndpointInfo[];
  stt: { mode: 'endpoint' | 'main-model' | 'none'; provider?: string; host?: string; model?: string; hasKey?: boolean };
  tts: { configured: boolean; provider?: string; host?: string; model?: string; hasKey?: boolean };
  retries: number;
  timeoutMs: number;
}

function info(env: EnvReader, prefix: string, role: string): EndpointInfo | null {
  const e = resolveEndpoint(env, prefix);
  if (!e) return null;
  return { role, provider: providerOf(e.baseUrl), host: hostOf(e.baseUrl), model: e.model, hasKey: !!e.apiKey, own: e.own, caps: e.caps };
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
  return {
    roles: roles.filter((r): r is EndpointInfo => !!r),
    stt: sttInfo(env, roles[0]),
    tts: ttsModel && ttsUrl
      ? { configured: true, provider: providerOf(ttsUrl), host: hostOf(ttsUrl), model: ttsModel, hasKey: !!env('TTS_API_KEY') }
      : { configured: false },
    retries: env('LLM_RETRIES') === undefined ? 2 : Number(env('LLM_RETRIES')),
    timeoutMs: Number(env('LLM_TIMEOUT_MS')) || 45000,
  };
}
