-- ============================================================================
-- Migration 003 — telemetry for the admin "AI agents" dashboard
--
-- Run ONCE in the Supabase SQL editor, after migration 002, and BEFORE
-- deploying the matching Edge Functions. Safe on the live database:
--   - purely additive: creates new `agent_*` tables and `agent_dash_*` /
--     `agent_dashboard` functions only;
--   - does NOT alter, rename or drop any existing table, column, view,
--     policy or function — the web app and the bot keep working as before
--     (without this migration the bot simply records nothing);
--   - idempotent (`if not exists`, `create or replace`, `on conflict`);
--   - all-or-nothing: wrapped in a transaction.
--
-- What is recorded (never message text, field values or personal data):
--   agent_turns          one row per message the bot handled: channel, kind of
--                        input, outcome, latency, conversation state
--   agent_service_calls  one row per call to an outside service (AI model,
--                        speech-to-text, text-to-speech, PDF, Telegram): latency,
--                        HTTP status, error kind, tokens, rate-limit headers
--   agent_model_prices   admin-edited prices, to estimate costs
--   agent_provider_budgets admin-edited budgets, prepaid credits and quotas
--
-- Access: agent_turns and agent_service_calls have RLS with NO policies (only
-- the Edge Functions' service role writes them); the admin reads aggregates
-- through agent_dashboard(), which checks the caller is signed in. Prices and
-- budgets are editable by the admin account, like the templates.
--
-- Rollback (touches nothing else):
--   drop function if exists public.agent_dashboard(timestamptz, timestamptz, text);
--   drop function if exists public.agent_dash_kpis(timestamptz, timestamptz),
--     public.agent_dash_series(timestamptz, timestamptz, text, text),
--     public.agent_dash_channels(timestamptz, timestamptz),
--     public.agent_dash_models(timestamptz, timestamptz),
--     public.agent_dash_tasks(timestamptz, timestamptz),
--     public.agent_dash_errors(timestamptz, timestamptz),
--     public.agent_dash_outages(timestamptz, timestamptz),
--     public.agent_dash_funnel(timestamptz, timestamptz),
--     public.agent_dash_documents(timestamptz, timestamptz),
--     public.agent_dash_users(timestamptz, timestamptz),
--     public.agent_dash_budgets(text),
--     public.agent_dash_prices(),
--     public.agent_dash_recent_failures(timestamptz, timestamptz),
--     public.agent_call_cost(text, text, text, integer, integer, numeric),
--     public.agent_prune_metrics(interval);
--   drop table if exists public.agent_service_calls, public.agent_turns,
--     public.agent_model_prices, public.agent_provider_budgets;
-- ============================================================================

begin;

-- --- Raw telemetry -------------------------------------------------------------

create table if not exists public.agent_turns (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  channel             text not null,                 -- telegram | whatsapp | web
  user_id             uuid references public.agent_channel_users(id) on delete set null,
  conversation_id     uuid references public.agent_conversations(id) on delete set null,
  input_kind          text not null default 'text',  -- text | voice | image | action | command | other
  state_before        text,                          -- new | choosing | collecting | confirming
  state_after         text,
  outcome             text not null,                 -- ok | busy | error | duplicate
  document_type_id    uuid references public.document_types(id) on delete set null,
  document_generated  boolean not null default false,
  latency_ms          integer not null default 0,    -- message received -> last reply sent
  audio_seconds       numeric,                       -- length of the voice note, if any
  error               text                           -- short, secrets removed
);

create index if not exists idx_agent_turns_created on public.agent_turns(created_at);
create index if not exists idx_agent_turns_conversation on public.agent_turns(conversation_id);

create table if not exists public.agent_service_calls (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  turn_id                uuid references public.agent_turns(id) on delete cascade,
  channel                text,
  service                text not null,              -- llm | stt | tts | pdf | channel
  provider               text not null,              -- google | groq | openrouter | telegram | gotenberg | <host>
  model                  text,
  role                   text,                       -- main | vision | fast | fallback
  operation              text not null,              -- chat | transcribe | speak | render | sendMessage...
  task                   text,                       -- intent | extraction | question | rewrite | transcribe
  ok                     boolean not null,
  http_status            integer,
  error_kind             text,                       -- rate_limit | overloaded | not_found | timeout | network | auth...
  error                  text,
  latency_ms             integer not null default 0,
  attempt                smallint not null default 0, -- 0 = first try, 1+ = retries on the same model
  input_tokens           integer,
  output_tokens          integer,
  units                  numeric,                    -- stt: audio seconds, tts: characters
  rl_limit_requests      integer,                    -- provider rate-limit headers (x-ratelimit-*)
  rl_remaining_requests  integer,
  rl_limit_tokens        integer,
  rl_remaining_tokens    integer
);

create index if not exists idx_agent_calls_created on public.agent_service_calls(created_at);
create index if not exists idx_agent_calls_model on public.agent_service_calls(provider, model, created_at);
create index if not exists idx_agent_calls_turn on public.agent_service_calls(turn_id);

-- --- Admin settings: prices, budgets, quotas -------------------------------------

-- Prices change and free tiers cost nothing, so nothing is seeded: the
-- dashboard lists the models in use that have no price yet.
create table if not exists public.agent_model_prices (
  provider               text not null,
  model                  text not null,              -- '*' = every model of the provider
  input_usd_per_mtok     numeric not null default 0 check (input_usd_per_mtok >= 0),
  output_usd_per_mtok    numeric not null default 0 check (output_usd_per_mtok >= 0),
  usd_per_audio_minute   numeric not null default 0 check (usd_per_audio_minute >= 0),
  usd_per_mchar          numeric not null default 0 check (usd_per_mchar >= 0),
  notes                  text not null default '',
  updated_at             timestamptz not null default now(),
  primary key (provider, model)
);

create table if not exists public.agent_provider_budgets (
  provider               text primary key,
  monthly_budget_usd     numeric check (monthly_budget_usd >= 0),   -- null = no budget
  prepaid_credit_usd     numeric check (prepaid_credit_usd >= 0),   -- credit bought, null = pay as you go
  credit_since           date,                                      -- spending counts against the credit from this day
  daily_request_limit    integer check (daily_request_limit >= 0),  -- free-tier quotas (requests per day)
  daily_token_limit      bigint check (daily_token_limit >= 0),
  notes                  text not null default '',
  updated_at             timestamptz not null default now()
);

alter table public.agent_turns enable row level security;
alter table public.agent_service_calls enable row level security;
alter table public.agent_model_prices enable row level security;
alter table public.agent_provider_budgets enable row level security;

drop policy if exists "admin full access agent_model_prices" on public.agent_model_prices;
create policy "admin full access agent_model_prices" on public.agent_model_prices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin full access agent_provider_budgets" on public.agent_provider_budgets;
create policy "admin full access agent_provider_budgets" on public.agent_provider_budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- --- Cost of one call at the current prices --------------------------------------
-- A model-specific price wins over the provider's '*' price. Failed calls carry
-- no tokens, so they cost nothing.

create or replace function public.agent_call_cost(
  p_service text, p_provider text, p_model text, p_in integer, p_out integer, p_units numeric
) returns numeric
language sql stable
set search_path = public
as $$
  select coalesce((
    select (coalesce(p_in, 0) * p.input_usd_per_mtok + coalesce(p_out, 0) * p.output_usd_per_mtok) / 1000000.0
         + case when p_service = 'stt' then coalesce(p_units, 0) / 60.0 * p.usd_per_audio_minute else 0 end
         + case when p_service = 'tts' then coalesce(p_units, 0) / 1000000.0 * p.usd_per_mchar else 0 end
    from public.agent_model_prices p
    where p.provider = p_provider and p.model in (coalesce(p_model, '*'), '*')
    order by (p.model = '*')
    limit 1
  ), 0);
$$;

-- --- Dashboard sections ------------------------------------------------------------
-- Each returns one JSON section for [p_from, p_to). agent_dashboard() below
-- assembles them; they are not callable from the browser (see the grants).

create or replace function public.agent_dash_kpis(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select
    (select jsonb_build_object(
        'turns',        count(*) filter (where outcome <> 'duplicate'),
        'ok',           count(*) filter (where outcome = 'ok'),
        'busy',         count(*) filter (where outcome = 'busy'),
        'errors',       count(*) filter (where outcome = 'error'),
        'duplicates',   count(*) filter (where outcome = 'duplicate'),
        'users',        count(distinct user_id),
        'documents',    count(*) filter (where document_generated),
        'voice_turns',  count(*) filter (where input_kind = 'voice'),
        'image_turns',  count(*) filter (where input_kind = 'image'),
        'audio_seconds', coalesce(sum(audio_seconds), 0),
        'avg_ms',       round(avg(latency_ms) filter (where outcome <> 'duplicate')),
        'p50_ms',       percentile_cont(0.5) within group (order by latency_ms) filter (where outcome <> 'duplicate'),
        'p95_ms',       percentile_cont(0.95) within group (order by latency_ms) filter (where outcome <> 'duplicate'))
     from public.agent_turns where created_at >= p_from and created_at < p_to)
  ||
    (select jsonb_build_object(
        'ai_calls',      count(*) filter (where service in ('llm', 'stt', 'tts')),
        'ai_failures',   count(*) filter (where service in ('llm', 'stt', 'tts') and not ok),
        'retries',       count(*) filter (where attempt > 0),
        'fallback_calls', count(*) filter (where role = 'fallback'),
        'channel_failures', count(*) filter (where service = 'channel' and not ok),
        'pdf_failures',  count(*) filter (where service = 'pdf' and not ok),
        'input_tokens',  coalesce(sum(input_tokens), 0),
        'output_tokens', coalesce(sum(output_tokens), 0),
        'cost_usd',      coalesce(sum(public.agent_call_cost(service, provider, model, input_tokens, output_tokens, units)), 0))
     from public.agent_service_calls where created_at >= p_from and created_at < p_to)
  ||
    jsonb_build_object(
      'new_users', (select count(*) from public.agent_channel_users where created_at >= p_from and created_at < p_to),
      'web_documents', (select count(*) from public.generated_documents
                        where created_at >= p_from and created_at < p_to and session_id not like 'agent:%'));
$$;

-- Buckets in local time (p_tz), with empty buckets filled so charts stay continuous.
create or replace function public.agent_dash_series(p_from timestamptz, p_to timestamptz, p_tz text, p_bucket text)
returns jsonb
language sql stable
set search_path = public
as $$
  with b as (
    select generate_series(
      date_trunc(p_bucket, p_from at time zone p_tz),
      date_trunc(p_bucket, (p_to - interval '1 second') at time zone p_tz),
      ('1 ' || p_bucket)::interval) as t
  ), tt as (
    select date_trunc(p_bucket, created_at at time zone p_tz) as t,
           count(*) filter (where outcome = 'ok') as ok,
           count(*) filter (where outcome = 'busy') as busy,
           count(*) filter (where outcome = 'error') as errors,
           count(*) filter (where document_generated) as documents,
           count(distinct user_id) as users,
           percentile_cont(0.5) within group (order by latency_ms) filter (where outcome <> 'duplicate') as p50_ms,
           percentile_cont(0.95) within group (order by latency_ms) filter (where outcome <> 'duplicate') as p95_ms
    from public.agent_turns where created_at >= p_from and created_at < p_to
    group by 1
  ), cc as (
    select date_trunc(p_bucket, created_at at time zone p_tz) as t,
           count(*) filter (where service in ('llm', 'stt', 'tts')) as ai_calls,
           count(*) filter (where not ok) as failed_calls,
           coalesce(sum(input_tokens), 0) as input_tokens,
           coalesce(sum(output_tokens), 0) as output_tokens,
           coalesce(sum(public.agent_call_cost(service, provider, model, input_tokens, output_tokens, units)), 0) as cost_usd
    from public.agent_service_calls where created_at >= p_from and created_at < p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      't', to_char(b.t, 'YYYY-MM-DD"T"HH24:MI'),
      'ok', coalesce(tt.ok, 0), 'busy', coalesce(tt.busy, 0), 'errors', coalesce(tt.errors, 0),
      'documents', coalesce(tt.documents, 0), 'users', coalesce(tt.users, 0),
      'p50_ms', tt.p50_ms, 'p95_ms', tt.p95_ms,
      'ai_calls', coalesce(cc.ai_calls, 0), 'failed_calls', coalesce(cc.failed_calls, 0),
      'input_tokens', coalesce(cc.input_tokens, 0), 'output_tokens', coalesce(cc.output_tokens, 0),
      'cost_usd', coalesce(cc.cost_usd, 0)) order by b.t), '[]'::jsonb)
  from b left join tt on tt.t = b.t left join cc on cc.t = b.t;
$$;

create or replace function public.agent_dash_channels(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by row->>'channel'), '[]'::jsonb) from (
    select jsonb_build_object(
      'channel',      channel,
      'turns',        count(*) filter (where outcome <> 'duplicate'),
      'users',        count(distinct user_id),
      'documents',    count(*) filter (where document_generated),
      'busy',         count(*) filter (where outcome = 'busy'),
      'errors',       count(*) filter (where outcome = 'error'),
      'duplicates',   count(*) filter (where outcome = 'duplicate'),
      'voice_turns',  count(*) filter (where input_kind = 'voice'),
      'image_turns',  count(*) filter (where input_kind = 'image'),
      'p50_ms',       percentile_cont(0.5) within group (order by latency_ms) filter (where outcome <> 'duplicate'),
      'p95_ms',       percentile_cont(0.95) within group (order by latency_ms) filter (where outcome <> 'duplicate'),
      'last_turn_at', max(created_at),
      'last_ok_at',   max(created_at) filter (where outcome = 'ok'),
      'last_error_at', max(created_at) filter (where outcome in ('busy', 'error'))) as row
    from public.agent_turns where created_at >= p_from and created_at < p_to
    group by channel
  ) s;
$$;

create or replace function public.agent_dash_models(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'calls')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'service',       service,
      'provider',      provider,
      'model',         coalesce(model, ''),
      'roles',         coalesce(jsonb_agg(distinct role) filter (where role is not null), '[]'::jsonb),
      'calls',         count(*),
      'ok_calls',      count(*) filter (where ok),
      'retries',       count(*) filter (where attempt > 0),
      'rate_limited',  count(*) filter (where error_kind = 'rate_limit'),
      'overloaded',    count(*) filter (where error_kind in ('overloaded', 'server_error')),
      'not_found',     count(*) filter (where error_kind = 'not_found'),
      'timeouts',      count(*) filter (where error_kind in ('timeout', 'network')),
      'auth_errors',   count(*) filter (where error_kind = 'auth'),
      'other_errors',  count(*) filter (where not ok and coalesce(error_kind, 'other') not in
                         ('rate_limit', 'overloaded', 'server_error', 'not_found', 'timeout', 'network', 'auth')),
      'p50_ms',        percentile_cont(0.5) within group (order by latency_ms) filter (where ok),
      'p95_ms',        percentile_cont(0.95) within group (order by latency_ms) filter (where ok),
      'input_tokens',  coalesce(sum(input_tokens), 0),
      'output_tokens', coalesce(sum(output_tokens), 0),
      'units',         coalesce(sum(units), 0),
      'cost_usd',      coalesce(sum(public.agent_call_cost(service, provider, model, input_tokens, output_tokens, units)), 0),
      'priced',        exists (select 1 from public.agent_model_prices p
                               where p.provider = c.provider and p.model in (coalesce(c.model, '*'), '*')),
      'first_at',      min(created_at),
      'last_ok_at',    max(created_at) filter (where ok),
      'last_error_at', max(created_at) filter (where not ok),
      'last_error_kind', (array_agg(error_kind order by created_at desc) filter (where not ok))[1],
      'rate_limit',    (array_agg(jsonb_build_object(
                          'at', created_at,
                          'limit_requests', rl_limit_requests, 'remaining_requests', rl_remaining_requests,
                          'limit_tokens', rl_limit_tokens, 'remaining_tokens', rl_remaining_tokens)
                        order by created_at desc)
                        filter (where rl_limit_requests is not null or rl_limit_tokens is not null
                                or rl_remaining_requests is not null or rl_remaining_tokens is not null))[1]) as row
    from public.agent_service_calls c
    where created_at >= p_from and created_at < p_to
    group by service, provider, model
  ) s;
$$;

create or replace function public.agent_dash_tasks(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'calls')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'service',       service,
      'task',          coalesce(task, operation),
      'calls',         count(*),
      'failures',      count(*) filter (where not ok),
      'avg_ms',        round(avg(latency_ms) filter (where ok)),
      'p95_ms',        percentile_cont(0.95) within group (order by latency_ms) filter (where ok),
      'input_tokens',  coalesce(sum(input_tokens), 0),
      'output_tokens', coalesce(sum(output_tokens), 0),
      'cost_usd',      coalesce(sum(public.agent_call_cost(service, provider, model, input_tokens, output_tokens, units)), 0)) as row
    from public.agent_service_calls
    where created_at >= p_from and created_at < p_to and service in ('llm', 'stt', 'tts', 'pdf')
    group by service, coalesce(task, operation)
  ) s;
$$;

create or replace function public.agent_dash_errors(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('service', service, 'error_kind', kind, 'count', n) order by n desc), '[]'::jsonb)
  from (
    select service, coalesce(error_kind, 'other') as kind, count(*) as n
    from public.agent_service_calls
    where created_at >= p_from and created_at < p_to and not ok
    group by 1, 2
  ) s;
$$;

-- Unavailability, estimated from real traffic: a 5-minute window in which a
-- service only failed. Consecutive windows are merged into one incident
-- (gaps and islands). service = 'agent' is what users saw: windows where every
-- message got a "busy" or error reply.
create or replace function public.agent_dash_outages(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  with windows as (
    select service, provider, coalesce(model, '') as model,
           to_timestamp(floor(extract(epoch from created_at) / 300) * 300) as win,
           count(*) filter (where ok) as oks,
           count(*) filter (where not ok) as fails,
           mode() within group (order by error_kind) filter (where not ok) as kind
    from public.agent_service_calls
    where created_at >= p_from and created_at < p_to
    group by 1, 2, 3, 4
    union all
    select 'agent', channel, '',
           to_timestamp(floor(extract(epoch from created_at) / 300) * 300),
           count(*) filter (where outcome = 'ok'),
           count(*) filter (where outcome in ('busy', 'error')),
           mode() within group (order by outcome) filter (where outcome in ('busy', 'error'))
    from public.agent_turns
    where created_at >= p_from and created_at < p_to and outcome <> 'duplicate'
    group by 1, 2, 3, 4
  ), bad as (
    select *, win - (row_number() over (partition by service, provider, model order by win)) * interval '5 minutes' as grp
    from windows where oks = 0 and fails > 0
  ), incidents as (
    select service, provider, model,
           min(win) as started_at, max(win) + interval '5 minutes' as ended_at,
           count(*) * 5 as minutes, sum(fails) as failures,
           jsonb_agg(distinct kind) filter (where kind is not null) as kinds
    from bad group by service, provider, model, grp
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'service', service, 'provider', provider, 'model', model,
      'started_at', started_at, 'ended_at', ended_at, 'minutes', minutes,
      'failures', failures, 'kinds', coalesce(kinds, '[]'::jsonb)) order by started_at desc), '[]'::jsonb)
  from (select * from incidents order by started_at desc limit 100) i;
$$;

create or replace function public.agent_dash_funnel(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'started',        count(*),
    'with_document',  count(*) filter (where c.document_type_id is not null),
    'reached_confirmation', count(*) filter (where c.status in ('confirming', 'done')
                        or exists (select 1 from public.agent_turns t
                                   where t.conversation_id = c.id and t.state_after = 'confirming')),
    'done',           count(*) filter (where c.status = 'done'),
    'cancelled',      count(*) filter (where c.status = 'cancelled'),
    'in_progress',    count(*) filter (where c.status in ('choosing', 'collecting', 'confirming')
                                         and c.updated_at >= now() - interval '24 hours'),
    'abandoned',      count(*) filter (where c.status in ('choosing', 'collecting', 'confirming')
                                         and c.updated_at < now() - interval '24 hours'),
    'median_minutes_to_done', percentile_cont(0.5) within group
                        (order by extract(epoch from c.updated_at - c.created_at) / 60.0)
                        filter (where c.status = 'done'),
    'avg_turns_to_done', (select round(avg(n), 1) from (
                           select count(*) as n
                           from public.agent_turns t
                           join public.agent_conversations d on d.id = t.conversation_id
                           where d.status = 'done' and d.created_at >= p_from and d.created_at < p_to
                           group by t.conversation_id) s))
  from public.agent_conversations c
  where c.created_at >= p_from and c.created_at < p_to;
$$;

create or replace function public.agent_dash_documents(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'agent')::int + (row->>'web')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'document_type_id', g.document_type_id,
      'name_ar', coalesce(d.name_ar, '—'),
      'agent',   count(*) filter (where g.session_id like 'agent:%'),
      'web',     count(*) filter (where g.session_id not like 'agent:%')) as row
    from public.generated_documents g
    left join public.document_types d on d.id = g.document_type_id
    where g.created_at >= p_from and g.created_at < p_to
    group by g.document_type_id, d.name_ar
    order by count(*) desc
    limit 20
  ) s;
$$;

create or replace function public.agent_dash_users(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'total',      count(*),
    'consented',  count(*) filter (where consent_at is not null),
    'voice',      count(*) filter (where prefers_voice),
    'new',        count(*) filter (where created_at >= p_from and created_at < p_to),
    'by_channel', coalesce((select jsonb_object_agg(channel, n)
                            from (select channel, count(*) as n from public.agent_channel_users group by channel) s),
                           '{}'::jsonb))
  from public.agent_channel_users;
$$;

-- Month-to-date and today's usage per provider (independent of the chosen
-- range), next to the admin's budget, credit and daily quotas.
create or replace function public.agent_dash_budgets(p_tz text)
returns jsonb
language sql stable
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', now() at time zone p_tz)) at time zone p_tz as month_start,
           (date_trunc('day', now() at time zone p_tz)) at time zone p_tz as day_start
  ), calls as (
    select c.*, public.agent_call_cost(c.service, c.provider, c.model, c.input_tokens, c.output_tokens, c.units) as cost_usd
    from public.agent_service_calls c
    where c.service <> 'channel'
      and c.created_at >= least((select month_start from bounds),
                                coalesce((select min(credit_since)::timestamptz from public.agent_provider_budgets),
                                         (select month_start from bounds)))
  ), providers as (
    select provider from public.agent_provider_budgets
    union
    select provider from calls where created_at >= (select month_start from bounds)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'provider',            p.provider,
      'monthly_budget_usd',  b.monthly_budget_usd,
      'prepaid_credit_usd',  b.prepaid_credit_usd,
      'credit_since',        b.credit_since,
      'daily_request_limit', b.daily_request_limit,
      'daily_token_limit',   b.daily_token_limit,
      'notes',               coalesce(b.notes, ''),
      'configured',          b.provider is not null,
      'month_start',         (select month_start from bounds),
      'month_spent_usd',     coalesce((select sum(cost_usd) from calls c
                                       where c.provider = p.provider and c.created_at >= (select month_start from bounds)), 0),
      'month_requests',      (select count(*) from calls c
                              where c.provider = p.provider and c.created_at >= (select month_start from bounds)),
      'credit_spent_usd',    case when b.credit_since is null then null else
                               coalesce((select sum(cost_usd) from calls c
                                         where c.provider = p.provider and c.created_at >= b.credit_since::timestamptz), 0) end,
      'today_requests',      (select count(*) from calls c
                              where c.provider = p.provider and c.created_at >= (select day_start from bounds)),
      'today_tokens',        coalesce((select sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)) from calls c
                                       where c.provider = p.provider and c.created_at >= (select day_start from bounds)), 0))
    order by p.provider), '[]'::jsonb)
  from providers p
  left join public.agent_provider_budgets b on b.provider = p.provider;
$$;

create or replace function public.agent_dash_prices()
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'prices', coalesce((select jsonb_agg(to_jsonb(p) order by p.provider, p.model) from public.agent_model_prices p), '[]'::jsonb),
    -- Models used in the last 90 days that have no price: their cost shows as 0.
    'unpriced', coalesce((select jsonb_agg(jsonb_build_object('service', service, 'provider', provider, 'model', model)
                                           order by provider, model)
                          from (select distinct service, provider, model from public.agent_service_calls c
                                where c.created_at >= now() - interval '90 days'
                                  and c.service in ('llm', 'stt', 'tts') and c.model is not null
                                  and not exists (select 1 from public.agent_model_prices p
                                                  where p.provider = c.provider and p.model in (c.model, '*'))) s),
                         '[]'::jsonb));
$$;

create or replace function public.agent_dash_recent_failures(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'calls', coalesce((select jsonb_agg(row) from (
        select jsonb_build_object('at', created_at, 'channel', channel, 'service', service, 'provider', provider,
                                  'model', model, 'role', role, 'operation', operation, 'task', task,
                                  'attempt', attempt, 'http_status', http_status, 'error_kind', error_kind,
                                  'error', error, 'latency_ms', latency_ms) as row
        from public.agent_service_calls
        where created_at >= p_from and created_at < p_to and not ok
        order by created_at desc limit 50) s), '[]'::jsonb),
    'turns', coalesce((select jsonb_agg(row) from (
        select jsonb_build_object('at', created_at, 'channel', channel, 'outcome', outcome, 'input_kind', input_kind,
                                  'state_before', state_before, 'error', error, 'latency_ms', latency_ms) as row
        from public.agent_turns
        where created_at >= p_from and created_at < p_to and outcome in ('busy', 'error')
        order by created_at desc limit 30) s), '[]'::jsonb));
$$;

-- --- Entry point for the admin dashboard -----------------------------------------
-- security definer: reads the service-role-only tables, but returns only
-- aggregates and error summaries — never conversation contents or profiles.

create or replace function public.agent_dashboard(p_from timestamptz, p_to timestamptz, p_tz text default 'Africa/Casablanca')
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_len interval := p_to - p_from;
  v_bucket text;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'agent_dashboard: admin only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or v_len <= interval '0' or v_len > interval '400 days' then
    raise exception 'agent_dashboard: invalid range' using errcode = '22023';
  end if;
  v_bucket := case when v_len <= interval '48 hours' then 'hour' else 'day' end;

  return jsonb_build_object(
    'generated_at', now(),
    'range',        jsonb_build_object('from', p_from, 'to', p_to, 'tz', p_tz, 'bucket', v_bucket),
    'kpis',         public.agent_dash_kpis(p_from, p_to),
    'previous',     public.agent_dash_kpis(p_from - v_len, p_from),
    'series',       public.agent_dash_series(p_from, p_to, p_tz, v_bucket),
    'channels',     public.agent_dash_channels(p_from, p_to),
    'models',       public.agent_dash_models(p_from, p_to),
    'tasks',        public.agent_dash_tasks(p_from, p_to),
    'errors',       public.agent_dash_errors(p_from, p_to),
    'outages',      public.agent_dash_outages(p_from, p_to),
    'funnel',       public.agent_dash_funnel(p_from, p_to),
    'documents',    public.agent_dash_documents(p_from, p_to),
    'users',        public.agent_dash_users(p_from, p_to),
    'budgets',      public.agent_dash_budgets(p_tz),
    'pricing',      public.agent_dash_prices(),
    'failures',     public.agent_dash_recent_failures(p_from, p_to),
    'last_turn_at', (select max(created_at) from public.agent_turns));
end;
$$;

-- Optional housekeeping (e.g. monthly with pg_cron): keeps the tables small.
create or replace function public.agent_prune_metrics(p_keep interval default interval '180 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
  v_turns integer;
begin
  delete from public.agent_service_calls where created_at < now() - p_keep;
  get diagnostics v_calls = row_count;
  delete from public.agent_turns where created_at < now() - p_keep;
  get diagnostics v_turns = row_count;
  return v_calls + v_turns;
end;
$$;

-- Only agent_dashboard() is callable from the browser, and only when signed in.
revoke all on function public.agent_call_cost(text, text, text, integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.agent_dash_kpis(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_series(timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.agent_dash_channels(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_models(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_tasks(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_errors(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_outages(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_funnel(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_documents(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_users(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_dash_budgets(text) from public, anon, authenticated;
revoke all on function public.agent_dash_prices() from public, anon, authenticated;
revoke all on function public.agent_dash_recent_failures(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agent_prune_metrics(interval) from public, anon, authenticated;
revoke all on function public.agent_dashboard(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.agent_dashboard(timestamptz, timestamptz, text) to authenticated;

commit;
