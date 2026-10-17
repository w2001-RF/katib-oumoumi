// Registers the bot's command menu (the "/" button next to the input box) with
// Telegram. Run once after deploying, and again whenever BOT_COMMANDS changes:
//
//   TELEGRAM_BOT_TOKEN=... npx deno run --allow-env --allow-net supabase/functions/telegram-webhook/set_commands.ts
//
// The token is read from the environment, never from a file in the repository.

import { BOT_COMMANDS } from '../_shared/agent/messages.ts';
import { TelegramChannel } from '../_shared/channels/telegram.ts';

/** Sends the command list; returns the command names, for the log. */
export async function registerCommands(channel: Pick<TelegramChannel, 'setMyCommands'>): Promise<string[]> {
  await channel.setMyCommands(BOT_COMMANDS);
  return BOT_COMMANDS.map((c) => `/${c.command}`);
}

/** The command-line run: 0 on success, 1 without a token. */
export async function main(
  token: string | undefined,
  makeChannel: (token: string) => Pick<TelegramChannel, 'setMyCommands'> = (t) => new TelegramChannel(t),
  log: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  if (!token) {
    log.error('TELEGRAM_BOT_TOKEN is not set');
    return 1;
  }
  const names = await registerCommands(makeChannel(token));
  log.log(`Command menu set: ${names.join(' ')}`);
  return 0;
}

if (import.meta.main) Deno.exit(await main(Deno.env.get('TELEGRAM_BOT_TOKEN')));
