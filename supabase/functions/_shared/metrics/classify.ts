// Turns raw HTTP outcomes into the dashboard's vocabulary.

import type { ErrorKind, RateLimit } from './types.ts';

const STATUS_KINDS: Record<number, ErrorKind> = {
  400: 'bad_request', 401: 'auth', 403: 'auth', 404: 'not_found', 408: 'timeout',
  422: 'bad_request', 429: 'rate_limit', 503: 'overloaded', 504: 'timeout', 529: 'overloaded',
};

export function errorKindFor(status: number | null | undefined, message = ''): ErrorKind {
  if (status && status >= 400) return STATUS_KINDS[status] ?? (status >= 500 ? 'server_error' : 'other');
  const m = message.toLowerCase();
  if (m.includes('timed out') || m.includes('timeout') || m.includes('aborted')) return 'timeout';
  if (m.includes('empty reply')) return 'empty_reply';
  return 'network';
}

// host suffix -> provider name shown on the dashboard (and used for prices)
const KNOWN_HOSTS: [suffix: string, provider: string][] = [
  ['generativelanguage.googleapis.com', 'google'],
  ['groq.com', 'groq'],
  ['openrouter.ai', 'openrouter'],
  ['openai.com', 'openai'],
  ['anthropic.com', 'anthropic'],
  ['mistral.ai', 'mistral'],
  ['together.xyz', 'together'],
  ['together.ai', 'together'],
  ['deepseek.com', 'deepseek'],
  ['fireworks.ai', 'fireworks'],
  ['cerebras.ai', 'cerebras'],
  ['huggingface.co', 'huggingface'],
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Provider name from an API base URL; the host itself for self-hosted servers. */
export function providerOf(baseUrl: string): string {
  const host = hostOf(baseUrl);
  if (!host) return 'unknown';
  const hit = KNOWN_HOSTS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`));
  return hit ? hit[1] : host;
}

function headerNumber(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** x-ratelimit-* headers (OpenAI, Groq, OpenRouter, Mistral...); undefined when absent. */
export function readRateLimit(headers: Headers): RateLimit | undefined {
  const rl: RateLimit = {
    limitRequests: headerNumber(headers, 'x-ratelimit-limit-requests'),
    remainingRequests: headerNumber(headers, 'x-ratelimit-remaining-requests'),
    limitTokens: headerNumber(headers, 'x-ratelimit-limit-tokens'),
    remainingTokens: headerNumber(headers, 'x-ratelimit-remaining-tokens'),
  };
  return Object.values(rl).some((v) => v !== undefined) ? rl : undefined;
}

const MAX_ERROR_LENGTH = 300;
const TELEGRAM_TOKEN = /bot\d+:[\w-]+/g;
const SECRET_PARAM = /([?&](?:key|api_key|token)=)[^&\s]+/gi;

/** Error text safe to store: bot tokens and API keys in URLs removed, shortened. */
export function redact(message: string): string {
  return message.replaceAll(TELEGRAM_TOKEN, 'bot<token>').replaceAll(SECRET_PARAM, '$1<redacted>').slice(0, MAX_ERROR_LENGTH);
}

/** The message of anything thrown. */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return JSON.stringify(e) ?? '';
}

export function errorText(e: unknown): string {
  return redact(messageOf(e));
}
