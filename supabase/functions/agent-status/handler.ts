// Live status for the admin dashboard: what is configured (models, speech,
// PDF, channels — never a key), and on request a live check of each AI
// endpoint (GET /models: reachable? key accepted? model still listed?), the
// OpenRouter credit, and Telegram's own view of the webhook (pending updates,
// last delivery error). Admin only.

import { capabilitiesFromShow, ollamaBase, showModel } from '../_shared/ai/ollama.ts';
import { joinUrl } from '../_shared/ai/openaiCompatible.ts';
import { type ApiKind, describeAiConfig, type EnvReader, resolveEndpoint, ROLE_PREFIX } from '../_shared/ai/registry.ts';
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

function authHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return apiKey ? { ...extra, Authorization: `Bearer ${apiKey}` } : { ...extra };
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

export interface Endpoint {
  kind: ApiKind;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  models: Set<string>;
  roles: Set<string>;
}

interface Use {
  role: string;
  kind: ApiKind;
  baseUrl?: string;
  apiKey: string;
  headers?: Record<string, string>;
  model?: string;
}

// Every distinct server + key in use, with the models and roles it serves.
export function endpointsInUse(env: EnvReader): Endpoint[] {
  const byKey = new Map<string, Endpoint>();
  const add = ({ role, kind, baseUrl, apiKey, headers = {}, model }: Use) => {
    if (!baseUrl || !model) return;
    const base = kind === 'ollama' ? ollamaBase(baseUrl) : baseUrl;
    const id = `${kind}\n${base}\n${apiKey}`;
    const e = byKey.get(id) ?? { kind, baseUrl: base, apiKey, headers, models: new Set<string>(), roles: new Set<string>() };
    e.models.add(model);
    e.roles.add(role);
    byKey.set(id, e);
  };
  const roles: [string, string][] = Object.entries(ROLE_PREFIX);
  if (env('LLM_FALLBACK_MODEL')) roles.push(['fallback', 'LLM_FALLBACK_']);
  for (const [role, prefix] of roles) {
    const r = resolveEndpoint(env, prefix);
    if (r) add({ role, kind: r.kind, baseUrl: r.baseUrl, apiKey: r.apiKey, headers: r.headers, model: r.model });
  }
  add({ role: 'stt', kind: 'openai', baseUrl: env('STT_BASE_URL'), apiKey: env('STT_API_KEY') ?? '', model: env('STT_MODEL') });
  add({ role: 'tts', kind: 'openai', baseUrl: env('TTS_BASE_URL'), apiKey: env('TTS_API_KEY') ?? '', model: env('TTS_MODEL') });
  return [...byKey.values()];
}

// Ids are "gemini-x" (Groq, OpenRouter) or "models/gemini-x" (Google).
function listed(ids: string[], model: string): boolean | null {
  if (!ids.length) return null;
  return ids.some((id) => id === model || id.endsWith(`/${model}`));
}

export async function probeEndpoint(e: Endpoint) {
  if (e.kind === 'ollama') return await probeOllama(e);
  const base = { kind: e.kind, provider: providerOf(e.baseUrl), host: hostOf(e.baseUrl), roles: [...e.roles], hasKey: !!e.apiKey };
  const r = await timed(async () => {
    const res = await fetch(joinUrl(e.baseUrl, 'models'), {
      headers: authHeaders(e.apiKey, e.headers), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
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

async function ollamaGet(e: Endpoint, path: string) {
  const res = await fetch(joinUrl(e.baseUrl, path), { headers: authHeaders(e.apiKey, e.headers), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  if (!res.ok) throw new HttpError(res.status, redact((await res.text()).slice(0, 200)));
  return await res.json();
}

class HttpError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`HTTP ${status}: ${detail}`);
  }
}

const MB = 1024 * 1024;

// An Ollama server: version, whether each model is pulled, which models are
// loaded in memory (and how much of them sits in GPU memory), and what each
// configured model can do.
export async function probeOllama(e: Endpoint) {
  const base = { kind: e.kind, provider: 'ollama', host: hostOf(e.baseUrl), roles: [...e.roles], hasKey: !!e.apiKey };
  const r = await timed(() => ollamaGet(e, 'api/tags'));
  if (!r.value) {
    const status = r.error?.startsWith('HTTP ') ? Number(r.error.slice(5, 8)) : null;
    return { ...base, ok: false, status, errorKind: errorKindFor(status, r.error), error: r.error, latencyMs: r.latencyMs };
  }
  const pulled: string[] = (r.value.models ?? []).map((m: { name?: string; model?: string }) => String(m.name ?? m.model ?? ''));
  const has = (model: string) => pulled.some((p) => p === model || p === `${model}:latest`);
  const [version, ps, shows] = await Promise.all([
    timed(() => ollamaGet(e, 'api/version')),
    timed(() => ollamaGet(e, 'api/ps')),
    Promise.all([...e.models].map(async (model) => {
      const show = has(model) ? await timed(() => showModel({ baseUrl: e.baseUrl, model, apiKey: e.apiKey, headers: e.headers })) : null;
      return [model, show?.value ? (show.value.capabilities ?? []) : null] as const;
    })),
  ]);
  const loaded = (ps.value?.models ?? []).map((m: { name?: string; size?: number; size_vram?: number; expires_at?: string }) => ({
    name: String(m.name ?? ''),
    sizeMb: Math.round((m.size ?? 0) / MB),
    gpuShare: m.size ? (m.size_vram ?? 0) / m.size : null,
    expiresAt: m.expires_at ?? null,
  }));
  return {
    ...base, ok: true, status: 200, latencyMs: r.latencyMs,
    version: version.value?.version ?? null,
    models: Object.fromEntries([...e.models].map((m) => [m, has(m)])),
    capabilities: Object.fromEntries(shows.map(([m, caps]) => [m, caps])),
    detected: Object.fromEntries(shows.map(([m, caps]) => [m, caps ? capabilitiesFromShow({ capabilities: caps }) : null])),
    loaded,
  };
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
