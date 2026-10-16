// Maps one handled message to the dashboard's turn record (agent_turns).

import type { InputKind, TurnOutcome, TurnRecord } from '../metrics/types.ts';
import type { Conversation, IncomingMessage } from './types.ts';

/** Filled while the engine handles a message. */
export interface TurnTrace {
  conv?: Conversation;
  stateBefore?: string;
  generated: boolean;
}

export function inputKind(msg: IncomingMessage): InputKind {
  if (msg.action) return 'action';
  if (msg.audio) return 'voice';
  if (msg.image) return 'image';
  if (msg.unsupported) return 'other';
  return (msg.text ?? '').trim().startsWith('/') ? 'command' : 'text';
}

export function turnRecord(
  msg: IncomingMessage,
  trace: TurnTrace,
  result: { userId?: string; outcome: TurnOutcome; error?: string; latencyMs: number },
): TurnRecord {
  return {
    channel: msg.channel,
    userId: result.userId,
    conversationId: trace.conv?.id,
    inputKind: inputKind(msg),
    stateBefore: trace.stateBefore,
    stateAfter: trace.conv?.status,
    outcome: result.outcome,
    documentTypeId: trace.conv?.document_type_id ?? null,
    documentGenerated: trace.generated,
    latencyMs: result.latencyMs,
    audioSeconds: msg.audio?.seconds,
    error: result.error,
  };
}
