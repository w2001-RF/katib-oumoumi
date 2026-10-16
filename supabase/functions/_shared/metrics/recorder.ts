// Collects the service calls of one handled message in memory and writes them
// with the turn record at the end, in two inserts (agent_turns,
// agent_service_calls — migration 003). Failures to record are logged and
// swallowed: telemetry must never break the bot, e.g. before 003 is applied.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import { redact } from './classify.ts';
import type { CallObserver, ServiceCallEvent, TurnMetrics, TurnRecord } from './types.ts';

export type TurnRow = Record<string, unknown> & { id: string };
export type CallRow = Record<string, unknown>;

export interface MetricsSink {
  write(turn: TurnRow, calls: CallRow[]): Promise<void>;
}

// A runaway loop must not turn into thousands of rows.
const MAX_CALLS_PER_TURN = 100;

export function toCallRow(e: ServiceCallEvent, at: Date): CallRow {
  return {
    created_at: at.toISOString(),
    service: e.service,
    provider: e.provider,
    model: e.model ?? null,
    role: e.role ?? null,
    operation: e.operation,
    task: e.task ?? null,
    ok: e.ok,
    http_status: e.httpStatus ?? null,
    error_kind: e.ok ? null : e.errorKind ?? 'other',
    error: e.error ? redact(e.error) : null,
    latency_ms: Math.max(0, Math.round(e.latencyMs)),
    attempt: e.attempt ?? 0,
    input_tokens: e.inputTokens ?? null,
    output_tokens: e.outputTokens ?? null,
    units: e.units ?? null,
    rl_limit_requests: e.rateLimit?.limitRequests ?? null,
    rl_remaining_requests: e.rateLimit?.remainingRequests ?? null,
    rl_limit_tokens: e.rateLimit?.limitTokens ?? null,
    rl_remaining_tokens: e.rateLimit?.remainingTokens ?? null,
  };
}

export function toTurnRow(t: TurnRecord, id: string, at: Date): TurnRow {
  return {
    id,
    created_at: at.toISOString(),
    channel: t.channel,
    user_id: t.userId ?? null,
    conversation_id: t.conversationId ?? null,
    input_kind: t.inputKind,
    state_before: t.stateBefore ?? null,
    state_after: t.stateAfter ?? null,
    outcome: t.outcome,
    document_type_id: t.documentTypeId ?? null,
    document_generated: t.documentGenerated,
    latency_ms: Math.max(0, Math.round(t.latencyMs)),
    audio_seconds: t.audioSeconds ?? null,
    error: t.error ? redact(t.error) : null,
  };
}

export class MetricsRecorder implements TurnMetrics {
  private readonly calls: CallRow[] = [];
  private readonly startedAt: Date;

  readonly observe: CallObserver = (event) => {
    if (this.calls.length < MAX_CALLS_PER_TURN) this.calls.push(toCallRow(event, this.now()));
  };

  /** `sink` null = telemetry off (calls are still accepted and dropped). */
  constructor(private readonly sink: MetricsSink | null, private readonly now: () => Date = () => new Date()) {
    this.startedAt = now();
  }

  async finishTurn(turn: TurnRecord): Promise<void> {
    const calls = this.calls.splice(0);
    if (!this.sink) return;
    const id = crypto.randomUUID();
    try {
      await this.sink.write(
        toTurnRow(turn, id, this.startedAt),
        calls.map((c) => ({ ...c, turn_id: id, channel: turn.channel })),
      );
    } catch (e) {
      console.warn('[metrics] turn not recorded (is migration 003 applied?)', (e as Error).message);
    }
  }
}

export class SupabaseMetricsSink implements MetricsSink {
  constructor(private readonly db: SupabaseClient) {}

  async write(turn: TurnRow, calls: CallRow[]): Promise<void> {
    const { error } = await this.db.from('agent_turns').insert(turn);
    if (error) throw new Error(error.message);
    if (!calls.length) return;
    const res = await this.db.from('agent_service_calls').insert(calls);
    if (res.error) throw new Error(res.error.message);
  }
}

export type EnvReader = (name: string) => string | undefined;

/** The production sink, or null when AGENT_METRICS=off or the service role is missing. */
export function metricsSinkFromEnv(env: EnvReader = (n) => Deno.env.get(n)): MetricsSink | null {
  if ((env('AGENT_METRICS') ?? '').toLowerCase() === 'off') return null;
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return new SupabaseMetricsSink(createClient(url, key, { auth: { persistSession: false } }));
}
