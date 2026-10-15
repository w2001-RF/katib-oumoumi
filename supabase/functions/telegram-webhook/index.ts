// Telegram webhook → Katib agent.
//
// Deploy (from the repository root; --use-api lets the bundle include the web
// app's shared modules in js/utils/):
//   npx supabase functions deploy telegram-webhook --no-verify-jwt --use-api
// Then register the webhook once (see docs/ai-agent.md).
//
// Telegram retries an update until it gets a 2xx, so we answer at once and do
// the slow work (speech, model, PDF) in the background.

import { handleMessage } from '../_shared/agent/engine.ts';
import { SupabaseAgentStore } from '../_shared/agent/store.ts';
import { getLLM, getSTT, getTTS } from '../_shared/ai/registry.ts';
import { TelegramChannel } from '../_shared/channels/telegram.ts';
import { getRenderer } from '../_shared/docs/render.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  return diff === 0;
}

async function handleUpdate(update: unknown, channel: TelegramChannel) {
  try {
    const msg = await channel.parseUpdate(update);
    if (!msg) return;
    await handleMessage(
      {
        store: new SupabaseAgentStore(),
        channel,
        llm: (role) => getLLM(role),
        stt: getSTT(),
        tts: getTTS(),
        renderer: getRenderer(),
      },
      msg,
    );
  } catch (e) {
    console.error('[telegram-webhook] update failed', e);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (!token || !secret) return new Response('Bot not configured', { status: 500 });
  // Only Telegram knows the secret set with setWebhook.
  if (!timingSafeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', secret)) {
    return new Response('Forbidden', { status: 403 });
  }
  const update = await req.json().catch(() => null);
  if (!update) return new Response('Bad request', { status: 400 });

  const work = handleUpdate(update, new TelegramChannel(token));
  if (typeof EdgeRuntime === 'undefined') await work; // local `deno run`: just wait
  else EdgeRuntime.waitUntil(work);
  return new Response('ok');
});
