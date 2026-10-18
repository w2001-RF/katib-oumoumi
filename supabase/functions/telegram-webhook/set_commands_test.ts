import { assertEquals } from 'jsr:@std/assert@1';
import { BOT_COMMANDS } from '../_shared/agent/messages.ts';
import { main, registerCommands } from './set_commands.ts';

Deno.test('registerCommands sends the whole command menu', async () => {
  const sent: unknown[] = [];
  const names = await registerCommands({ setMyCommands: (c) => (sent.push(c), Promise.resolve()) });
  assertEquals(sent, [BOT_COMMANDS]);
  assertEquals(names[0], '/new');
  assertEquals(names.length, BOT_COMMANDS.length);
});

Deno.test('main: needs a token, then registers and logs the menu', async () => {
  const logs: string[] = [];
  const log = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(`ERR ${m}`) };
  const tokens: string[] = [];
  const makeChannel = (t: string) => (tokens.push(t), { setMyCommands: () => Promise.resolve() });
  assertEquals(await main(undefined, makeChannel, log), 1);
  assertEquals(logs, ['ERR TELEGRAM_BOT_TOKEN is not set']);
  assertEquals(await main('T', makeChannel, log), 0);
  assertEquals(tokens, ['T']);
  assertEquals(logs.at(-1)!.startsWith('Command menu set: /new'), true);
});
