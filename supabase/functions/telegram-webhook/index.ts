// Telegram webhook → Katib agent.
//
// Deploy (from the repository root; --use-api lets the bundle include the web
// app's shared modules in js/utils/):
//   npx supabase functions deploy telegram-webhook --use-api
// (JWT verification is off for this function in supabase/config.toml.)
// Then register the webhook once (see docs/ai-agent.md).

import { SupabaseAgentStore } from '../_shared/agent/store.ts';
import { getLLM, getSTT, getTTS, prepareModels } from '../_shared/ai/registry.ts';
import { getRenderer } from '../_shared/docs/render.ts';
import { MetricsRecorder, metricsSinkFromEnv } from '../_shared/metrics/recorder.ts';
import { createWebhookHandler } from './handler.ts';

// Telemetry for the admin dashboard (migration 003); AGENT_METRICS=off disables it.
const metricsSink = metricsSinkFromEnv();

// Supabase's runtime global; absent when the file runs under plain Deno.
const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;

Deno.serve(
  createWebhookHandler({
    token: Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '',
    secret: Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '',
    makeMetrics: () => new MetricsRecorder(metricsSink),
    // Ollama models: ask the server once whether they read images (cached).
    prepare: () => prepareModels(),
    makeDeps: (channel, metrics) => ({
      store: new SupabaseAgentStore(),
      channel,
      llm: (role) => getLLM(role, undefined, metrics?.observe),
      stt: getSTT(undefined, metrics?.observe),
      tts: getTTS(undefined, metrics?.observe),
      renderer: getRenderer(metrics?.observe),
      // Used when the admin has not set one in the dashboard (agent_settings).
      systemPrompt: Deno.env.get('BOT_SYSTEM_PROMPT') ?? '',
    }),
    waitUntil: edgeRuntime ? (work) => edgeRuntime.waitUntil(work) : undefined,
  }),
);
