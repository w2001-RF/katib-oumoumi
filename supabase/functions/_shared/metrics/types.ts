// Telemetry for the admin dashboard (js/admin/adminAgents.js, migration 003):
// one event per call to an outside service and one record per handled
// message. Never message text, field values or personal data. Recording never
// changes what the agent does and never fails a turn.

export type ServiceKind = 'llm' | 'stt' | 'tts' | 'pdf' | 'channel';

export type ErrorKind =
  | 'rate_limit' | 'overloaded' | 'server_error' | 'not_found' | 'timeout'
  | 'network' | 'auth' | 'bad_request' | 'empty_reply' | 'other';

/** Provider rate-limit headers (x-ratelimit-*), when the provider sends them. */
export interface RateLimit {
  limitRequests?: number;
  remainingRequests?: number;
  limitTokens?: number;
  remainingTokens?: number;
}

export interface ServiceCallEvent {
  service: ServiceKind;
  provider: string;
  model?: string;
  /** main | vision | fast | fallback */
  role?: string;
  operation: string;
  /** intent | extraction | question | rewrite | transcribe */
  task?: string;
  ok: boolean;
  httpStatus?: number | null;
  errorKind?: ErrorKind;
  error?: string;
  latencyMs: number;
  /** 0 = first try, 1+ = retries on the same model. */
  attempt?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** stt: audio seconds, tts: characters. */
  units?: number;
  rateLimit?: RateLimit;
}

export type CallObserver = (event: ServiceCallEvent) => void;

export type TurnOutcome = 'ok' | 'busy' | 'error' | 'duplicate';
export type InputKind = 'text' | 'voice' | 'image' | 'action' | 'command' | 'other';

export interface TurnRecord {
  channel: string;
  userId?: string;
  conversationId?: string;
  inputKind: InputKind;
  stateBefore?: string;
  stateAfter?: string;
  outcome: TurnOutcome;
  documentTypeId?: string | null;
  documentGenerated: boolean;
  latencyMs: number;
  audioSeconds?: number;
  error?: string;
}

/** What the engine and the adapters see: report calls, close the turn. */
export interface TurnMetrics {
  readonly observe: CallObserver;
  /** Writes the turn and its calls. Never throws. */
  finishTurn(turn: TurnRecord): Promise<void>;
}

/** Calls an observer without letting it break the caller. */
export function emit(observe: CallObserver | undefined, event: ServiceCallEvent): void {
  if (!observe) return;
  try {
    observe(event);
  } catch (e) {
    console.warn('[metrics] observer failed', (e as Error).message);
  }
}
