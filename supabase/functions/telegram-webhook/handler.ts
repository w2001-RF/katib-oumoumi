// Request handling for the Telegram webhook, kept apart from Deno.serve so it
// can be tested with fake dependencies.
//
// Telegram retries an update until it gets a 2xx, so we answer at once and do
// the slow work (speech, model, PDF) in the background.

import { type AgentDeps, handleMessage } from '../_shared/agent/engine.ts';
import { TelegramChannel } from '../_shared/channels/telegram.ts';
import { errorText } from '../_shared/metrics/classify.ts';
import type { CallObserver, TurnMetrics } from '../_shared/metrics/types.ts';

export interface WebhookConfig {
  token: string;
  secret: string;
  /** Builds the agent's dependencies for one update; `metrics` is that update's recorder. */
  makeDeps: (channel: TelegramChannel, metrics?: TurnMetrics) => AgentDeps;
  /** One telemetry recorder per update (admin dashboard); absent = nothing recorded. */
  makeMetrics?: () => TurnMetrics;
  /** Keeps background work alive after the response (EdgeRuntime.waitUntil); absent = wait inline. */
  waitUntil?: (work: Promise<unknown>) => void;
  /** For tests: replaces the real Telegram adapter. */
  makeChannel?: (token: string, observe?: CallObserver) => TelegramChannel;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  return diff === 0;
}

async function handleUpdate(update: unknown, config: WebhookConfig) {
  const receivedAt = Date.now();
  const metrics = config.makeMetrics?.();
  const channel = config.makeChannel
    ? config.makeChannel(config.token, metrics?.observe)
    : new TelegramChannel(config.token, metrics?.observe);
  let msg;
  try {
    msg = await channel.parseUpdate(update);
  } catch (e) {
    // e.g. the voice note could not be downloaded: the user got no answer.
    console.error('[telegram-webhook] could not read update', e);
    await metrics?.finishTurn({
      channel: 'telegram', inputKind: 'other', outcome: 'error', documentGenerated: false,
      latencyMs: Date.now() - receivedAt, error: errorText(e),
    });
    return;
  }
  if (!msg) return;
  try {
    await handleMessage({ ...config.makeDeps(channel, metrics), metrics }, { ...msg, receivedAt });
  } catch (e) {
    console.error('[telegram-webhook] update failed', e);
  }
}

export function createWebhookHandler(config: WebhookConfig): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== 'POST') return new Response('ok');
    if (!config.token || !config.secret) return new Response('Bot not configured', { status: 500 });
    // Only Telegram knows the secret set with setWebhook.
    if (!timingSafeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', config.secret)) {
      return new Response('Forbidden', { status: 403 });
    }
    const update = await req.json().catch(() => null);
    if (!update) return new Response('Bad request', { status: 400 });

    const work = handleUpdate(update, config);
    if (config.waitUntil) config.waitUntil(work);
    else await work;
    return new Response('ok');
  };
}
