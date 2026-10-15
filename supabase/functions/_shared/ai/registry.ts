// The only place that reads AI configuration. Every role needs at most three
// variables, and each falls back to the main model's:
//
//   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL [/ LLM_CAPS]          main (required)
//   LLM_VISION_BASE_URL / ..._API_KEY / ..._MODEL [/ ..._CAPS]   images (optional)
//   LLM_FAST_BASE_URL   / ..._API_KEY / ..._MODEL [/ ..._CAPS]   cheap steps (optional)
//   LLM_FALLBACK_BASE_URL / ..._API_KEY / ..._MODEL [/ ..._CAPS] used on 429/5xx (optional)
//   STT_BASE_URL / STT_API_KEY / STT_MODEL [/ STT_LANGUAGE]      speech-to-text (optional)
//   TTS_BASE_URL / TTS_API_KEY / TTS_MODEL / TTS_VOICE [/ TTS_FORMAT]  voice replies (optional)

import { FallbackLLM } from './fallback.ts';
import { capabilitiesFor } from './models.ts';
import { OpenAICompatibleLLM } from './openaiCompatible.ts';
import { LLMAudioSTT, OpenAICompatibleSTT, OpenAICompatibleTTS } from './speech.ts';
import type { LLM, SpeechToText, TextToSpeech } from './types.ts';

export type EnvReader = (name: string) => string | undefined;
export type Role = 'main' | 'vision' | 'fast';

const denoEnv: EnvReader = (name) => Deno.env.get(name);

function endpoint(env: EnvReader, prefix: string) {
  const model = env(`${prefix}MODEL`) || env('LLM_MODEL');
  const baseUrl = env(`${prefix}BASE_URL`) || env('LLM_BASE_URL');
  if (!model || !baseUrl) return null;
  // A role that names its own server must also bring its own key.
  const apiKey = env(`${prefix}BASE_URL`) ? env(`${prefix}API_KEY`) ?? '' : env(`${prefix}API_KEY`) ?? env('LLM_API_KEY') ?? '';
  return new OpenAICompatibleLLM({
    baseUrl,
    apiKey,
    model,
    caps: capabilitiesFor(model, env(`${prefix}CAPS`) ?? (prefix === 'LLM_' ? undefined : env('LLM_CAPS'))),
    timeoutMs: Number(env('LLM_TIMEOUT_MS')) || 45000,
  });
}

const ROLE_PREFIX: Record<Role, string> = { main: 'LLM_', vision: 'LLM_VISION_', fast: 'LLM_FAST_' };

export function getLLM(role: Role = 'main', env: EnvReader = denoEnv): LLM {
  const primary = endpoint(env, ROLE_PREFIX[role]);
  if (!primary) throw new Error('AI is not configured: set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY unless the server is local).');
  const fallback = env('LLM_FALLBACK_MODEL') ? endpoint(env, 'LLM_FALLBACK_') : null;
  return fallback ? new FallbackLLM([primary, fallback]) : primary;
}

export function getSTT(env: EnvReader = denoEnv): SpeechToText | null {
  const model = env('STT_MODEL');
  const baseUrl = env('STT_BASE_URL');
  if (model && baseUrl) return new OpenAICompatibleSTT(baseUrl, env('STT_API_KEY') ?? '', model, env('STT_LANGUAGE'));
  const main = getLLM('main', env);
  return main.caps.audioInput ? new LLMAudioSTT(main) : null;
}

export function getTTS(env: EnvReader = denoEnv): TextToSpeech | null {
  const model = env('TTS_MODEL');
  const baseUrl = env('TTS_BASE_URL');
  if (!model || !baseUrl) return null;
  return new OpenAICompatibleTTS(baseUrl, env('TTS_API_KEY') ?? '', model, env('TTS_VOICE') || 'alloy', env('TTS_FORMAT') || 'opus');
}
