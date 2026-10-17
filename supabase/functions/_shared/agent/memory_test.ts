import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  HISTORY_MAX_CHARS_PER_ENTRY,
  HISTORY_MAX_ENTRIES,
  historyForPrompt,
  IMAGE_MARKER,
  recentUserText,
  remember,
} from './memory.ts';

Deno.test('remember: appends, clips long texts, keeps a fixed window', () => {
  let h = remember(undefined, 'user', '  السلام   عليكم ');
  assertEquals(h, [{ role: 'user', text: 'السلام عليكم' }]);
  assertEquals(remember(h, 'bot', '   '), h, 'empty texts are ignored');

  const long = remember([], 'user', 'ا'.repeat(1000))[0].text;
  assertEquals(long.length, HISTORY_MAX_CHARS_PER_ENTRY);
  assert(long.endsWith('…'));

  for (let i = 0; i < 20; i++) h = remember(h, i % 2 ? 'bot' : 'user', `m${i}`);
  assertEquals(h.length, HISTORY_MAX_ENTRIES);
  assertEquals(h.at(-1)!.text, 'm19', 'newest kept');
  assertEquals(remember(null as unknown as [], 'user', 'x'), [{ role: 'user', text: 'x' }], 'tolerates a missing column');
});

Deno.test('historyForPrompt: chronological lines within a budget, newest first to survive', () => {
  const h = [
    { role: 'user' as const, text: 'الجار ديالي' },
    { role: 'bot' as const, text: 'شنو سميتك؟' },
    { role: 'user' as const, text: 'فاطمة' },
  ];
  assertEquals(historyForPrompt(h), 'User: الجار ديالي\nAssistant: شنو سميتك؟\nUser: فاطمة');
  assertEquals(historyForPrompt(h, { skipLast: true }), 'User: الجار ديالي\nAssistant: شنو سميتك؟');
  assertEquals(historyForPrompt(h, { budget: 40 }), 'Assistant: شنو سميتك؟\nUser: فاطمة');
  assertEquals(historyForPrompt(h, { budget: 5 }), '');
  assertEquals(historyForPrompt(undefined), '');
  assertEquals(historyForPrompt([{ role: 'bot', text: 'x' }], { skipLast: true }), 'Assistant: x', 'only a user message is skipped');
});

Deno.test('recentUserText: the last user messages, without image markers', () => {
  const h = [
    { role: 'user' as const, text: 'a' },
    { role: 'bot' as const, text: 'q' },
    { role: 'user' as const, text: IMAGE_MARKER },
    { role: 'user' as const, text: 'b' },
    { role: 'user' as const, text: 'c' },
    { role: 'user' as const, text: 'd' },
  ];
  assertEquals(recentUserText(h), 'b\nc\nd');
  assertEquals(recentUserText(h, 10), 'a\nb\nc\nd');
  assertEquals(recentUserText(undefined), '');
});
