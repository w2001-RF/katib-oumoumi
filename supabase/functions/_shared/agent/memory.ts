// Short-term memory of a conversation: the last few exchanges, kept on the
// conversation row (agent_conversations.history) and shown to the model as
// context, so it can resolve "same address as before", "no, the other one",
// a correction spread over two messages...
//
// Bounded on purpose: a small fixed window of recent turns, each clipped, and
// a character budget when it is put into a prompt. Older turns add tokens
// (cost, latency) without helping the narrow tasks in tasks.ts. Images and
// audio are never stored: a voice note is kept as its transcript, an image as
// a marker. Everything is deleted with the conversation (/forget, retention).

export interface HistoryEntry {
  role: 'user' | 'bot';
  text: string;
}

export const HISTORY_MAX_ENTRIES = 8;
export const HISTORY_MAX_CHARS_PER_ENTRY = 400;
export const HISTORY_PROMPT_BUDGET = 1600;
export const IMAGE_MARKER = '[صورة]';

const ELLIPSIS = '…';

function clip(text: string, max: number): string {
  const t = text.replaceAll(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + ELLIPSIS : t;
}

/** The history with `entry` appended, clipped, oldest entries dropped. Empty texts are ignored. */
export function remember(history: HistoryEntry[] | undefined, role: HistoryEntry['role'], text: string): HistoryEntry[] {
  const list = Array.isArray(history) ? history : [];
  const clipped = clip(text ?? '', HISTORY_MAX_CHARS_PER_ENTRY);
  if (!clipped) return list;
  return [...list, { role, text: clipped }].slice(-HISTORY_MAX_ENTRIES);
}

/**
 * The most recent exchanges as "User: … / Assistant: …" lines, newest kept
 * first when the budget is tight, in chronological order. `skipLast` leaves
 * out the latest user message (it is sent to the model separately).
 */
export function historyForPrompt(history: HistoryEntry[] | undefined, { budget = HISTORY_PROMPT_BUDGET, skipLast = false } = {}): string {
  const list = Array.isArray(history) ? [...history] : [];
  if (skipLast && list.at(-1)?.role === 'user') list.pop();
  const lines: string[] = [];
  let used = 0;
  for (const entry of list.toReversed()) {
    const line = `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.text}`;
    if (used + line.length > budget) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

/** The latest user messages joined, to read a request the user spread over several messages. */
export function recentUserText(history: HistoryEntry[] | undefined, count = 3): string {
  const list = Array.isArray(history) ? history : [];
  return list
    .filter((e) => e.role === 'user' && e.text !== IMAGE_MARKER)
    .slice(-count)
    .map((e) => e.text)
    .join('\n');
}
