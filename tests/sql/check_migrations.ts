// Runs the real SQL (schema + templates + migrations) in PGlite — Postgres
// compiled to WebAssembly — with Supabase's `auth` schema and roles stubbed,
// then exercises agent_dashboard(). No database server or Docker needed:
//
//   npx deno run --allow-read --allow-env --allow-net --allow-sys tests/sql/check_migrations.ts
//
// Not part of `deno test` (it downloads PGlite from npm on first run).

import { PGlite } from 'npm:@electric-sql/pglite@0.3.6';

const root = new URL('../../supabase/', import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.role() to anon, authenticated, service_role;
`;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${message}`);
  console.log(`ok  ${message}`);
}

const db = new PGlite();
await db.exec(SUPABASE_STUBS);
// gen_random_uuid() is built in since Postgres 13; PGlite ships no pgcrypto by default.
await db.exec((await read('schema.sql')).replace('create extension if not exists "pgcrypto";', ''));
await db.exec(await read('templates.sql'));
// 001 upgrades the pre-normalization schema; schema.sql is already normalized.
for (const m of ['002_ai_agent.sql', '003_agent_dashboard.sql', '004_agent_memory_settings.sql']) {
  await db.exec(await read(`migrations/${m}`));
  console.log(`ok  applied ${m}`);
}
// Additive and idempotent: running 003 again changes nothing and does not fail.
await db.exec(await read('migrations/003_agent_dashboard.sql'));
assert(true, '003 can be applied twice');
await db.exec(await read('migrations/004_agent_memory_settings.sql'));
assert(true, '004 can be applied twice');

// --- sample telemetry ---------------------------------------------------------
await db.exec(`
  insert into agent_channel_users (id, channel, external_id, consent_at, prefers_voice)
  values ('00000000-0000-0000-0000-000000000001', 'telegram', '42', now(), true);
  insert into agent_conversations (id, user_id, status, document_type_id, created_at, updated_at)
  select '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 'done', id,
         now() - interval '50 minutes', now() - interval '40 minutes'
  from document_types order by sort_order limit 1;
  insert into agent_turns (id, created_at, channel, user_id, conversation_id, input_kind, state_before, state_after,
                           outcome, document_generated, latency_ms, audio_seconds, error)
  values
    ('00000000-0000-0000-0000-0000000000a1', now() - interval '45 minutes', 'telegram', '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-0000000000c1', 'voice', 'new', 'collecting', 'ok', false, 4200, 7, null),
    ('00000000-0000-0000-0000-0000000000a2', now() - interval '42 minutes', 'telegram', '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-0000000000c1', 'text', 'collecting', 'confirming', 'ok', false, 2100, null, null),
    ('00000000-0000-0000-0000-0000000000a3', now() - interval '41 minutes', 'telegram', '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-0000000000c1', 'action', 'confirming', 'done', 'ok', true, 3900, null, null),
    ('00000000-0000-0000-0000-0000000000a4', now() - interval '20 minutes', 'telegram', '00000000-0000-0000-0000-000000000001',
     null, 'text', null, null, 'busy', false, 61000, null, 'HTTP 503 high demand');
  insert into agent_service_calls (created_at, turn_id, channel, service, provider, model, role, operation, task, ok,
                                   http_status, error_kind, latency_ms, attempt, input_tokens, output_tokens, units,
                                   rl_limit_requests, rl_remaining_requests)
  values
    (now() - interval '45 minutes', '00000000-0000-0000-0000-0000000000a1', 'telegram', 'stt', 'groq', 'whisper-large-v3', null,
     'transcribe', 'transcribe', true, 200, null, 900, 0, null, null, 7, 2000, 1999),
    (now() - interval '45 minutes', '00000000-0000-0000-0000-0000000000a1', 'telegram', 'llm', 'google', 'gemini-3.8-flash', 'fast',
     'chat', 'intent', true, 200, null, 1200, 0, 1500, 40, null, null, null),
    (now() - interval '42 minutes', '00000000-0000-0000-0000-0000000000a2', 'telegram', 'llm', 'google', 'gemini-3.8-flash', 'main',
     'chat', 'extraction', true, 200, null, 1800, 0, 2500, 120, null, null, null),
    (now() - interval '20 minutes', '00000000-0000-0000-0000-0000000000a4', 'telegram', 'llm', 'google', 'gemini-3.8-flash', 'main',
     'chat', 'extraction', false, 503, 'overloaded', 800, 0, null, null, null, null, null),
    (now() - interval '20 minutes', '00000000-0000-0000-0000-0000000000a4', 'telegram', 'llm', 'google', 'gemini-3.8-flash', 'main',
     'chat', 'extraction', false, 503, 'overloaded', 700, 1, null, null, null, null, null),
    (now() - interval '20 minutes', '00000000-0000-0000-0000-0000000000a4', 'telegram', 'llm', 'groq', 'openai/gpt-oss-120b', 'fallback',
     'chat', 'extraction', false, 429, 'rate_limit', 300, 0, null, null, null, 1000, 0);
  insert into agent_model_prices (provider, model, input_usd_per_mtok, output_usd_per_mtok) values ('google', '*', 0.5, 2);
  insert into agent_model_prices (provider, model, usd_per_audio_minute) values ('groq', 'whisper-large-v3', 0.006);
  insert into agent_provider_budgets (provider, monthly_budget_usd, daily_request_limit) values ('google', 5, 1500);
  insert into generated_documents (document_type_id, session_id) select id, 'agent:telegram:x' from document_types limit 1;
  insert into generated_documents (document_type_id, session_id) select id, 'browser-session' from document_types limit 1;
`);

// --- access control -------------------------------------------------------------
async function callAs(role: string | null) {
  await db.exec(`reset role; select set_config('request.jwt.claim.role', '${role ?? ''}', false);`);
  if (role) await db.exec(`set role ${role === 'service_role' ? 'service_role' : role}`);
  try {
    const res = await db.query<{ d: any }>(`select agent_dashboard(now() - interval '24 hours', now()) as d`);
    return { data: res.rows[0].d, error: null as string | null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  } finally {
    await db.exec('reset role');
  }
}

const anon = await callAs('anon');
assert(anon.error?.includes('permission denied'), `anon cannot call agent_dashboard (${anon.error})`);
await db.exec(`set role anon`);
const anonTurns = await db.query(`select count(*) from agent_turns`).catch((e) => ({ error: (e as Error).message }));
await db.exec('reset role');
assert('error' in anonTurns || (anonTurns as any).rows[0].count === 0, 'anon cannot read raw telemetry');

const noClaim = await callAs(null);
assert(noClaim.error?.includes('admin only'), 'a caller without a signed-in role is refused');

const helper = await (async () => {
  await db.exec(`set role authenticated`);
  try {
    await db.query(`select agent_dash_kpis(now() - interval '1 day', now())`);
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await db.exec('reset role');
  }
})();
assert(helper?.includes('permission denied'), 'internal agent_dash_* helpers are not callable from the browser');

// --- results ------------------------------------------------------------------------
const { data: d, error } = await callAs('authenticated');
assert(!error, `admin gets the dashboard ${error ?? ''}`);
const k = d.kpis;
assert(k.turns === 4 && k.ok === 3 && k.busy === 1 && k.documents === 1, 'turn counts');
assert(k.voice_turns === 1 && Number(k.audio_seconds) === 7, 'voice share and audio seconds');
assert(k.input_tokens === 4000 && k.output_tokens === 160, 'token totals');
const expectedCost = (4000 * 0.5 + 160 * 2) / 1e6 + (7 / 60) * 0.006;
assert(Math.abs(Number(k.cost_usd) - expectedCost) < 1e-9, `cost at current prices = ${k.cost_usd}`);
assert(k.retries === 1 && k.fallback_calls === 1 && k.ai_failures === 3, 'retries, fallback and failures');
assert(k.web_documents === 1, 'web documents counted apart from the agent');
assert(d.range.bucket === 'hour' && d.series.length >= 24, `hourly series with empty buckets filled (${d.series.length})`);
assert(d.series.reduce((s: number, p: any) => s + p.ok + p.busy, 0) === 4, 'series adds up to the turns');

const gemini = d.models.find((m: any) => m.model === 'gemini-3.8-flash');
assert(gemini.calls === 4 && gemini.ok_calls === 2 && gemini.overloaded === 2 && gemini.priced, 'per-model availability and errors');
assert(gemini.roles.includes('main') && gemini.roles.includes('fast'), 'roles the model served');
const groq = d.models.find((m: any) => m.model === 'openai/gpt-oss-120b');
assert(groq.rate_limited === 1 && groq.rate_limit.remaining_requests === 0 && !groq.priced, 'capacity from rate-limit headers');
assert(d.pricing.unpriced.some((u: any) => u.model === 'openai/gpt-oss-120b'), 'unpriced models are listed');

const agentOutage = d.outages.find((o: any) => o.service === 'agent');
assert(agentOutage && agentOutage.minutes === 5 && agentOutage.kinds.includes('busy'), 'user-facing outage window');
assert(d.outages.some((o: any) => o.model === 'gemini-3.8-flash'), 'model outage window');
assert(d.funnel.started === 1 && d.funnel.done === 1 && d.funnel.reached_confirmation === 1, 'conversation funnel');
assert(Number(d.funnel.avg_turns_to_done) === 3, 'turns needed to finish a document');
assert(d.documents[0].agent === 1 && d.documents[0].web === 1, 'documents by channel');
assert(d.users.total === 1 && d.users.voice === 1 && d.users.by_channel.telegram === 1, 'user totals');
const google = d.budgets.find((b: any) => b.provider === 'google');
assert(google.configured && Number(google.monthly_budget_usd) === 5 && google.today_requests >= 1, 'budget usage');
assert(d.failures.calls.length === 3 && d.failures.turns.length === 1, 'recent failures');
assert(d.channels[0].channel === 'telegram' && d.channels[0].busy === 1, 'per-channel stats');

const week = await db.query<{ d: any }>(`select agent_dashboard(now() - interval '7 days', now()) as d`)
  .catch(() => null);
assert(week === null || week.rows.length === 1, 'week range');
await db.exec(`select set_config('request.jwt.claim.role', 'authenticated', false)`);
const weekly = (await db.query<{ d: any }>(`select agent_dashboard(now() - interval '7 days', now()) as d`)).rows[0].d;
assert(weekly.range.bucket === 'day' && weekly.series.length >= 7, 'daily buckets for longer ranges');
const bad = await db.query(`select agent_dashboard(now(), now() - interval '1 day')`).catch((e) => (e as Error).message);
assert(typeof bad === 'string' && bad.includes('invalid range'), 'reversed range is refused');

const pruned = (await db.query<{ n: number }>(`select agent_prune_metrics(interval '30 minutes') as n`)).rows[0].n;
assert(pruned > 0, `pruning removes old rows (${pruned})`);

// --- 004: memory, settings, retention ------------------------------------------
await db.exec(`
  insert into agent_conversations (id, user_id, status, updated_at, history) values
    ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-000000000001', 'done', now() - interval '40 days', '[{"role":"user","text":"x"}]'),
    ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-000000000001', 'collecting', now(), default);
`);
const fresh = (await db.query<{ h: unknown }>(`select history as h from agent_conversations where id = '00000000-0000-0000-0000-0000000a0002'`)).rows[0].h;
assert(Array.isArray(fresh) && fresh.length === 0, 'history defaults to an empty list');
const prompt = (await db.query<{ value: string }>(`select value from agent_settings where key = 'system_prompt'`)).rows[0];
assert(prompt?.value === '', 'system_prompt setting seeded empty');
const tooLong = await db.query(`update agent_settings set value = repeat('x', 4001) where key = 'system_prompt'`).catch((e) => (e as Error).message);
assert(typeof tooLong === 'string' && tooLong.includes('check'), 'settings are limited to 4000 characters');
await db.exec(`set role anon`);
const anonSettings = await db.query<{ n: number }>(`select count(*)::int as n from agent_settings`).catch((e) => ({ error: (e as Error).message }));
await db.exec('reset role');
assert('error' in anonSettings || anonSettings.rows[0].n === 0, 'anon cannot read the settings');
const purgeDenied = await (async () => {
  await db.exec(`set role authenticated`);
  try {
    await db.query(`select agent_purge_conversations(30)`);
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await db.exec('reset role');
  }
})();
assert(purgeDenied?.includes('permission denied'), 'purge is not callable from the browser');
const purged = (await db.query<{ n: number }>(`select agent_purge_conversations(30) as n`)).rows[0].n;
const kept = (await db.query<{ id: string }>(`select id from agent_conversations where id::text like '%0000000a000%'`)).rows.map((r) => r.id);
assert(purged >= 1 && kept.length === 1 && kept[0].endsWith('0000000a0002'), `purge removes only conversations older than 30 days (${purged} removed)`);

console.log('\nAll SQL checks passed.');
