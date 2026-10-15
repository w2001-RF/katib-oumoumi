// Telegram webhook → Katib agent.
//
// Deploy (from the repository root; --use-api lets the bundle include the web
// app's shared modules in js/utils/):
//   npx supabase functions deploy telegram-webhook --use-api
// (JWT verification is off for this function in supabase/config.toml.)
// Then register the webhook once (see docs/ai-agent.md).

import { SupabaseAgentStore } from '../_shared/agent/store.ts';
import { getLLM, getSTT, getTTS } from '../_shared/ai/registry.ts';
import { getRenderer } from '../_shared/docs/render.ts';
import { createWebhookHandler } from './handler.ts';

// Supabase's runtime global; absent when the file runs under plain Deno.
const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;

Deno.serve(
  createWebhookHandler({
    token: Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '',
    secret: Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '',
    makeDeps: (channel) => ({
      store: new SupabaseAgentStore(),
      channel,
      llm: (role) => getLLM(role),
      stt: getSTT(),
      tts: getTTS(),
      renderer: getRenderer(),
    }),
    waitUntil: edgeRuntime ? (work) => edgeRuntime.waitUntil(work) : undefined,
  }),
);
