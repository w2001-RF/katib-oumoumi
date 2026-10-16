// Run: npx deno test --allow-env supabase/functions
import { assertEquals } from 'jsr:@std/assert@1';
import { HtmlFileRenderer } from '../_shared/docs/render.ts';
import type { TelegramChannel } from '../_shared/channels/telegram.ts';
import { MemoryStore, RecordingChannel, ScriptedLLM } from '../_shared/testing/agentFakes.ts';
import type { TurnMetrics, TurnRecord } from '../_shared/metrics/types.ts';
import { createWebhookHandler, timingSafeEqual } from './handler.ts';

const post = (body: string, secret = 's3cret') =>
  new Request('https://fn/telegram-webhook', { method: 'POST', body, headers: { 'X-Telegram-Bot-Api-Secret-Token': secret } });

function setup(overrides: { token?: string; parse?: () => Promise<unknown> } = {}) {
  const channel = new RecordingChannel();
  const store = new MemoryStore();
  const fakeTelegram = Object.assign(channel, {
    parseUpdate: overrides.parse ?? ((u: { message?: { text?: string }; update_id: number }) =>
      Promise.resolve(u.message ? {
        channel: 'telegram', externalUserId: '1', chatId: '1', displayName: '', updateId: u.update_id, text: u.message.text,
      } : null)),
  }) as unknown as TelegramChannel;
  const background: Promise<unknown>[] = [];
  const handler = createWebhookHandler({
    token: overrides.token ?? 'TOKEN',
    secret: 's3cret',
    makeChannel: () => fakeTelegram,
    makeDeps: (ch) => ({ store, channel: ch, llm: () => new ScriptedLLM({}), stt: null, tts: null, renderer: new HtmlFileRenderer() }),
    waitUntil: (work) => background.push(work),
  });
  return { handler, channel, background };
}

Deno.test('timingSafeEqual', () => {
  assertEquals([timingSafeEqual('abc', 'abc'), timingSafeEqual('abc', 'abd'), timingSafeEqual('abc', 'ab')], [true, false, false]);
});

Deno.test('webhook: rejects bad requests before doing any work', async () => {
  const { handler, background } = setup();
  assertEquals((await handler(new Request('https://fn', { method: 'GET' }))).status, 200);
  assertEquals((await handler(post('{}', 'wrong'))).status, 403);
  assertEquals((await handler(post('not json'))).status, 400);
  assertEquals((await setup({ token: '' }).handler(post('{}'))).status, 500);
  assertEquals(background.length, 0);
});

Deno.test('webhook: answers at once and handles the update in the background', async () => {
  const { handler, channel, background } = setup();
  const res = await handler(post(JSON.stringify({ update_id: 1, message: { text: '/help' } })));
  assertEquals(res.status, 200);
  await Promise.all(background);
  assertEquals(channel.texts.length, 1);

  await handler(post(JSON.stringify({ update_id: 2, edited_message: {} })));
  await Promise.all(background);
  assertEquals(channel.texts.length, 1, 'ignored update');
});

Deno.test('webhook: without waitUntil it waits; failures are logged, not thrown', async () => {
  const { channel } = setup();
  const handler = createWebhookHandler({
    token: 'T', secret: 's3cret',
    makeChannel: () => Object.assign(channel, { parseUpdate: () => Promise.reject(new Error('download failed')) }) as unknown as TelegramChannel,
    makeDeps: () => { throw new Error('unused'); },
  });
  assertEquals((await handler(post(JSON.stringify({ update_id: 3 })))).status, 200);
});

Deno.test('webhook: telemetry per update, including updates that could not be read', async () => {
  const turns: TurnRecord[] = [];
  const observers: unknown[] = [];
  const metrics = (): TurnMetrics => ({ observe: () => {}, finishTurn: (t) => {
    turns.push(t);
    return Promise.resolve();
  } });
  const channel = new RecordingChannel();
  let parse: () => Promise<unknown> = () => Promise.reject(new Error('download failed for bot1:SECRET'));
  const handler = createWebhookHandler({
    token: 'T', secret: 's3cret', makeMetrics: metrics,
    makeChannel: (_token, observe) => {
      observers.push(observe);
      return Object.assign(channel, { parseUpdate: () => parse() }) as unknown as TelegramChannel;
    },
    makeDeps: (ch) => ({ store: new MemoryStore(), channel: ch, llm: () => new ScriptedLLM({}), stt: null, tts: null, renderer: new HtmlFileRenderer() }),
  });
  await handler(post(JSON.stringify({ update_id: 4 })));
  assertEquals([turns[0].outcome, turns[0].inputKind, turns[0].error], ['error', 'other', 'download failed for bot<token>']);
  assertEquals(typeof observers[0], 'function', 'the channel reports its own calls');

  parse = () => Promise.resolve({ channel: 'telegram', externalUserId: '9', chatId: '9', displayName: '', updateId: 5, text: '/help' });
  await handler(post(JSON.stringify({ update_id: 5 })));
  assertEquals([turns[1].outcome, turns[1].inputKind], ['ok', 'command']);
});
