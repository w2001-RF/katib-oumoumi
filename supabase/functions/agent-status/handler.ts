// Live status for the admin dashboard: what is configured (models, speech,
// PDF, channels — never a key), and on request a live check of each AI
// endpoint (GET /models: reachable? key accepted? model still listed?), the
// OpenRouter credit, and Telegram's own view of the webhook (pending updates,
// last delivery error). Admin only.

import { joinUrl } from '../_shared/ai/openaiCompatible.ts';
import { describeAiConfig, type EnvReader, resolveEndpoint, ROLE_PREFIX } from '../_shared/ai/registry.ts';
import { errorKindFor, hostOf, providerOf, redact } from '../_shared/metrics/classify.ts';

export interface StatusConfig {
  env: EnvReader;
  /** True when the request comes from the signed-in admin. */
  authorize: (req: Request) => Promise<boolean>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const PROBE_TIMEOUT_MS = 10000;
const TELEGRAM_API = 'https://api.telegram.org';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function timed<T>(run: () => Promise<T>): Promise<{ value?: T; error?: string; latencyMs: number }> {
  const started = Date.now();
  try {
    return { value: await run(), latencyMs: Date.now() - started };
  } catch (e) {
    return { error: redact((e as Error).message), latencyMs: Date.now() - started };
  }
}

// --- AI endpoints ----------------------------------------------------------------

interface Endpoint {
  baseUrl: string;
  apiKey: string;
  models: Set<string>;
  roles: Set<string>;
}

// Every distinct server + key in use, with the models and roles it serves.
export function endpointsInUse(env: EnvReader): Endpoint[] {
  const byKey = new Map<string, Endpoint>();
  const add = (role: string, baseUrl: string | undefined, apiKey: string, model: string | undefined) => {
    if (!baseUrl || !model) return;
    const id = `${baseUrl}\n${apiKey}`;
    const e = byKey.get(id) ?? { baseUrl, apiKey, models: new Set<string>(), roles: new Set<string>() };
    e.models.add(model);
    e.roles.add(role);
    byKey.set(id, e);
  };
  for (const [role, prefix] of Object.entries(ROLE_PREFIX)) {
    const r = resolveEndpoint(env, prefix);
    if (r) add(role, r.baseUrl, r.apiKey, r.model);
  }
  if (env('LLM_FALLBACK_MODEL')) {
    const r = resolveEndpoint(env, 'LLM_FALLBACK_');
    if (r) add('fallback', r.baseUrl, r.apiKey, r.model);
  }
  add('stt', env('STT_BASE_URL'), env('STT_API_KEY') ?? '', env('STT_MODEL'));
  add('tts', env('TTS_BASE_URL'), env('TTS_API_KEY') ?? '', env('TTS_MODEL'));
  return [...byKey.values()];
}

// Ids are "gemini-x" (Groq, OpenRouter) or "models/gemini-x" (Google).
function listed(ids: string[], model: string): boolean | null {
  if (!ids.length) return null;
  return ids.some((id) => id === model || id.endsWith(`/${model}`));
}

export async function probeEndpoint(e: Endpoint) {
  const base = { provider: providerOf(e.baseUrl), host: hostOf(e.baseUrl), roles: [...e.roles], hasKey: !!e.apiKey };
  const r = await timed(async () => {
    const res = await fetch(joinUrl(e.baseUrl, 'models'), { headers: authHeaders(e.apiKey), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  });
  if (!r.value) return { ...base, ok: false, status: null, errorKind: errorKindFor(null, r.error), error: r.error, latencyMs: r.latencyMs };
  const { status, ok, text } = r.value;
  if (!ok) {
    return { ...base, ok: false, status, errorKind: errorKindFor(status), error: redact(text.slice(0, 200)), latencyMs: r.latencyMs };
  }
  let ids: string[] = [];
  try {
    const data = JSON.parse(text);
    ids = Array.isArray(data?.data) ? data.data.map((m: { id?: unknown }) => (typeof m.id === 'string' ? m.id : '')) : [];
  } catch { /* a server without a model list is still reachable */ }
  const models = Object.fromEntries([...e.models].map((m) => [m, listed(ids, m)]));
  return { ...base, ok: true, status, latencyMs: r.latencyMs, models };
}

// OpenRouter is the one common provider with a credit API.
export async function openRouterCredit(e: Endpoint) {
  const r = await timed(async () => {
    const res = await fetch('https://openrouter.ai/api/v1/key', { headers: authHeaders(e.apiKey), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json())?.data ?? {};
  });
  if (!r.value) return { provider: 'openrouter', ok: false, error: r.error };
  const d = r.value;
  return {
    provider: 'openrouter', ok: true,
    limitUsd: d.limit ?? null, usageUsd: d.usage ?? null, remainingUsd: d.limit_remaining ?? null, freeTier: !!d.is_free_tier,
  };
}

// --- channels ----------------------------------------------------------------------

async function telegramCall(token: string, method: string) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`Telegram ${method}: ${res.status} ${data.description ?? ''}`);
  return data.result;
}

export async function telegramStatus(env: EnvReader) {
  const token = env('TELEGRAM_BOT_TOKEN');
  if (!token) return { configured: false };
  const [me, hook] = await Promise.all([timed(() => telegramCall(token, 'getMe')), timed(() => telegramCall(token, 'getWebhookInfo'))]);
  const w = hook.value;
  const toIso = (seconds?: number) => (seconds ? new Date(seconds * 1000).toISOString() : null);
  return {
    configured: true,
    secretSet: !!env('TELEGRAM_WEBHOOK_SECRET'),
    reachable: !!me.value,
    latencyMs: me.latencyMs,
    error: me.error ?? hook.error,
    bot: me.value ? { username: me.value.username, name: me.value.first_name } : null,
    webhook: w
      ? {
        set: !!w.url,
        host: w.url ? hostOf(w.url) : null,
        pendingUpdates: w.pending_update_count ?? 0,
        lastErrorAt: toIso(w.last_error_date),
        lastError: w.last_error_message ? redact(w.last_error_message) : null,
        lastSyncErrorAt: toIso(w.last_synchronization_error_date),
        maxConnections: w.max_connections ?? null,
      }
      : null,
  };
}

export async function buildStatus(env: EnvReader, probe: boolean) {
  const pdfUrl = env('PDF_SERVICE_URL');
  const status: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    ai: describeAiConfig(env),
    pdf: pdfUrl ? { configured: true, provider: 'gotenberg', host: hostOf(pdfUrl) } : { configured: false, fallback: 'html' },
    metrics: (env('AGENT_METRICS') ?? '').toLowerCase() === 'off' ? 'off' : 'on',
    channels: {
      telegram: await telegramStatus(env),
      // No WhatsApp adapter yet (see docs/ai-agent.md, next steps).
      whatsapp: { configured: !!env('WHATSAPP_ACCESS_TOKEN'), implemented: false },
    },
  };
  if (probe) {
    const endpoints = endpointsInUse(env);
    status.probes = await Promise.all(endpoints.map(probeEndpoint));
    status.credits = await Promise.all(endpoints.filter((e) => providerOf(e.baseUrl) === 'openrouter').map(openRouterCredit));
  }
  return status;
}

export function createStatusHandler(config: StatusConfig): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    if (!(await config.authorize(req).catch(() => false))) return json({ error: 'admin only' }, 401);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    try {
      return json(await buildStatus(config.env, body?.probe === true));
    } catch (e) {
      console.error('[agent-status] failed', e);
      return json({ error: redact((e as Error).message) }, 500);
    }
  };
}
