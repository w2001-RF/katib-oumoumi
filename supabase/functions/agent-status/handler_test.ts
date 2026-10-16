// Run: npx deno test --config tests/deno.json --allow-env supabase/functions
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { jsonResponse, withFetch } from '../_shared/testing/fakeFetch.ts';
import { createStatusHandler, endpointsInUse } from './handler.ts';

const ENV: Record<string, string> = {
  LLM_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/', LLM_API_KEY: 'SECRET-G', LLM_MODEL: 'gemini-3.8-flash',
  LLM_FALLBACK_BASE_URL: 'https://openrouter.ai/api/v1', LLM_FALLBACK_API_KEY: 'SECRET-O', LLM_FALLBACK_MODEL: 'meta-llama/llama-3.3-70b-instruct:free',
  STT_BASE_URL: 'https://api.groq.com/openai/v1', STT_API_KEY: 'SECRET-Q', STT_MODEL: 'whisper-large-v3',
  TELEGRAM_BOT_TOKEN: '123:SECRET-T', TELEGRAM_WEBHOOK_SECRET: 'x', PDF_SERVICE_URL: 'https://pdf.example.com',
};

const handler = (env: Record<string, string> = ENV, allowed = true) =>
  createStatusHandler({ env: (n) => env[n], authorize: () => Promise.resolve(allowed) });
const post = (body: unknown) => new Request('https://fn/agent-status', { method: 'POST', body: JSON.stringify(body) });

// Answers like each real API would.
function fakeApis(url: string): Response {
  if (url.endsWith('/getMe')) return jsonResponse({ ok: true, result: { username: 'katib_bot', first_name: 'Katib' } });
  if (url.endsWith('/getWebhookInfo')) {
    return jsonResponse({ ok: true, result: {
      url: 'https://p.supabase.co/functions/v1/telegram-webhook', pending_update_count: 3,
      last_error_date: 1760000000, last_error_message: 'Wrong response from the webhook: 500', max_connections: 40,
    } });
  }
  if (url.startsWith('https://generativelanguage.googleapis.com')) return jsonResponse({ data: [{ id: 'models/gemini-2.0-flash' }] });
  if (url === 'https://openrouter.ai/api/v1/models') return jsonResponse({ data: [{ id: 'meta-llama/llama-3.3-70b-instruct:free' }] });
  if (url === 'https://openrouter.ai/api/v1/key') return jsonResponse({ data: { limit: 10, usage: 2.5, limit_remaining: 7.5, is_free_tier: false } });
  if (url.startsWith('https://api.groq.com')) return new Response('{"error":"invalid api key"}', { status: 401 });
  return new Response('?', { status: 500 });
}

Deno.test('agent-status: CORS preflight, methods and admin check', async () => {
  assertEquals((await handler()(new Request('https://fn', { method: 'OPTIONS' }))).status, 204);
  assertEquals((await handler()(new Request('https://fn', { method: 'DELETE' }))).status, 405);
  assertEquals((await handler(ENV, false)(post({}))).status, 401);
  const throwing = createStatusHandler({ env: () => undefined, authorize: () => Promise.reject(new Error('auth down')) });
  assertEquals((await throwing(post({}))).status, 401);
});

Deno.test('agent-status: configuration and Telegram health, never a secret', async () => {
  await withFetch((r) => fakeApis(r.url), async (reqs) => {
    const res = await handler()(new Request('https://fn', { method: 'GET' }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
    const body = await res.json();
    assertEquals(body.ai.roles.map((r: { role: string }) => r.role), ['main', 'vision', 'fast', 'fallback']);
    assertEquals(body.ai.stt.mode, 'endpoint');
    assertEquals(body.pdf, { configured: true, provider: 'gotenberg', host: 'pdf.example.com' });
    const tg = body.channels.telegram;
    assertEquals([tg.reachable, tg.bot.username, tg.webhook.pendingUpdates, tg.webhook.host], [true, 'katib_bot', 3, 'p.supabase.co']);
    assertEquals(tg.webhook.lastErrorAt, new Date(1760000000 * 1000).toISOString());
    assertEquals(body.channels.whatsapp, { configured: false, implemented: false });
    assertEquals(body.probes, undefined, 'no live checks unless asked');
    assertEquals(reqs.length, 2);
    assert(!JSON.stringify(body).includes('SECRET'));
  });
});

Deno.test('agent-status: live checks find a retired model, a bad key and the credit', async () => {
  await withFetch((r) => fakeApis(r.url), async () => {
    const body = await (await handler()(post({ probe: true }))).json();
    const byProvider = Object.fromEntries(body.probes.map((p: { provider: string }) => [p.provider, p]));
    assertEquals(byProvider.google.ok, true);
    assertEquals(byProvider.google.models, { 'gemini-3.8-flash': false }, 'the configured model is not listed any more');
    assertEquals(byProvider.google.roles, ['main', 'vision', 'fast']);
    assertEquals(byProvider.openrouter.models, { 'meta-llama/llama-3.3-70b-instruct:free': true });
    assertEquals([byProvider.groq.ok, byProvider.groq.status, byProvider.groq.errorKind], [false, 401, 'auth']);
    assertEquals(body.credits, [{ provider: 'openrouter', ok: true, limitUsd: 10, usageUsd: 2.5, remainingUsd: 7.5, freeTier: false }]);
    assert(!JSON.stringify(body).includes('SECRET'));
  });
});

Deno.test('agent-status: unreachable services are reported, not thrown', async () => {
  await withFetch(() => Promise.reject(new TypeError('error sending request for url (https://api.telegram.org/bot123:SECRET-T/getMe)')),
    async () => {
      const body = await (await handler()(post({ probe: true }))).json();
      assertEquals(body.channels.telegram.reachable, false);
      assertEquals(body.channels.telegram.webhook, null);
      assert(body.probes.every((p: { ok: boolean; errorKind: string }) => !p.ok && p.errorKind === 'network'));
      assertEquals(body.credits[0].ok, false);
      assert(!JSON.stringify(body).includes('SECRET'));
    });
  // A server without a model list, a credit API error, nothing configured.
  const answers = (url: string) => (url.endsWith('/key') ? new Response('no', { status: 403 }) : new Response('not json'));
  await withFetch((r) => answers(r.url), async () => {
    const env = { LLM_BASE_URL: 'https://openrouter.ai/api/v1', LLM_MODEL: 'x', AGENT_METRICS: 'off' };
    const body = await (await handler(env)(post({ probe: true }))).json();
    assertEquals([body.probes[0].ok, body.probes[0].models.x, body.probes[0].hasKey], [true, null, false]);
    assertEquals([body.credits[0].ok, body.metrics, body.channels.telegram.configured, body.pdf.configured], [false, 'off', false, false]);
  });
});

Deno.test('agent-status: a failure while building the status is a 500 with no secret', async () => {
  const broken = createStatusHandler({
    env: (n) => (n === 'TELEGRAM_BOT_TOKEN' ? (() => { throw new Error('bad env bot1:SECRET'); })() : undefined),
    authorize: () => Promise.resolve(true),
  });
  const res = await broken(post({}));
  assertEquals(res.status, 500);
  assert(!(await res.text()).includes('SECRET'));
});

Deno.test('endpoints in use are grouped by server and key', () => {
  const groups = endpointsInUse((n) => ({ ...ENV, TTS_BASE_URL: 'https://api.groq.com/openai/v1', TTS_API_KEY: 'SECRET-Q', TTS_MODEL: 'playai-tts' })[n]);
  assertEquals(groups.map((g) => [[...g.roles], [...g.models]]), [
    [['main', 'vision', 'fast'], ['gemini-3.8-flash']],
    [['fallback'], ['meta-llama/llama-3.3-70b-instruct:free']],
    [['stt', 'tts'], ['whisper-large-v3', 'playai-tts']],
  ]);
});
