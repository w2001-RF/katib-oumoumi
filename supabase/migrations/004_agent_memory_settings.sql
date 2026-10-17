-- ============================================================================
-- Migration 004 — bot memory, settings (system prompt) and retention
--
-- Run ONCE in the Supabase SQL editor, after migration 003, and BEFORE
-- deploying the matching telegram-webhook function (it reads the new column).
-- Safe on the live database:
--   - additive: one new column on the bot's own agent_conversations table
--     (with a default, so existing rows stay valid), one new table and one
--     new function. No web app table, view, policy or function is touched;
--   - idempotent (`if not exists`, `create or replace`, `on conflict`);
--   - all-or-nothing: wrapped in a transaction.
--
-- What it adds:
--   agent_conversations.history   the last few exchanges of a conversation
--                                 (short, clipped texts; never images or
--                                 audio), shown to the model as context.
--                                 Deleted with the conversation (/forget,
--                                 retention below).
--   agent_settings                admin-edited bot settings, starting with
--                                 `system_prompt`: extra instructions (tone,
--                                 style) added to every model request.
--   agent_purge_conversations()   deletes conversations older than N days
--                                 (default 30). The bot also prunes a user's
--                                 old conversations when they start a new one.
--                                 Optional daily run with pg_cron:
--     select cron.schedule('agent-purge', '0 3 * * *',
--                          $$select public.agent_purge_conversations(30)$$);
--
-- Rollback (touches nothing else):
--   drop function if exists public.agent_purge_conversations(integer);
--   drop table if exists public.agent_settings;
--   alter table public.agent_conversations drop column if exists history;
-- ============================================================================

begin;

alter table public.agent_conversations
  add column if not exists history jsonb not null default '[]'::jsonb;

create table if not exists public.agent_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value       text not null default '' check (char_length(value) <= 4000),
  updated_at  timestamptz not null default now()
);

alter table public.agent_settings enable row level security;

-- Editable by the admin account, like the templates, prices and budgets.
-- The bot reads it with the service role key.
drop policy if exists "admin full access agent_settings" on public.agent_settings;
create policy "admin full access agent_settings" on public.agent_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into public.agent_settings (key, value) values ('system_prompt', '')
on conflict (key) do nothing;

create or replace function public.agent_purge_conversations(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.agent_conversations
  where updated_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 30), 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Not callable from the browser; the service role (and pg_cron) can run it.
revoke all on function public.agent_purge_conversations(integer) from public, anon, authenticated;

commit;
