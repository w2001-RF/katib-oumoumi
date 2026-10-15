-- ============================================================================
-- Migration 002 — AI agent (Telegram / WhatsApp bot)
--
-- Run ONCE in the Supabase SQL editor, after schema.sql + templates.sql (or
-- after migration 001). Safe on the live database:
--   - purely additive: only creates new `agent_*` tables;
--   - does NOT alter, rename or drop any existing table, column, view,
--     policy or function — the web app keeps working exactly as before;
--   - idempotent: `if not exists` / `on conflict do nothing`, so running it
--     twice changes nothing;
--   - all-or-nothing: wrapped in a transaction.
--
-- Rollback (only if you want the agent gone; touches nothing else):
--   drop table if exists public.agent_conversations, public.agent_user_profiles,
--     public.agent_channel_users, public.agent_field_hints,
--     public.agent_document_hints;
--
-- Access: RLS is enabled with NO policies, so the anon/authenticated keys used
-- by the web app cannot read or write these tables. Only the Edge Functions,
-- which use the service role key, can.
-- ============================================================================

begin;

-- --- Hints the agent uses on top of the existing templates -------------------

-- Per document: how users describe it (to pick the right document from a
-- free-text or spoken request), what to tell them after generation, and which
-- of its fields describe the user themself (for reusing their saved profile).
create table if not exists public.agent_document_hints (
  document_type_id  uuid primary key references public.document_types(id) on delete cascade,
  keywords          text not null default '',   -- words/phrases in Darija, Arabic, French
  next_steps_ar     text not null default '',   -- what to do with the printed document
  -- profile attribute -> field_key, e.g. {"cin": "رقم البطاقة الوطنية"}.
  -- Only these fields are prefilled from / saved to the user's profile.
  self_fields       jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

-- Per field: an optional hand-written question, used instead of a generated one.
create table if not exists public.agent_field_hints (
  field_id          uuid primary key references public.field_definitions(id) on delete cascade,
  ask_prompt        text not null default '',
  updated_at        timestamptz not null default now()
);

-- --- Bot users and conversations ----------------------------------------------

create table if not exists public.agent_channel_users (
  id              uuid primary key default gen_random_uuid(),
  channel         text not null check (channel in ('telegram', 'whatsapp', 'web')),
  external_id     text not null,              -- Telegram user id / WhatsApp phone
  display_name    text not null default '',
  prefers_voice   boolean not null default false,
  consent_at      timestamptz,                -- null = not agreed yet; nothing is sent to AI providers
  last_update_id  bigint,                     -- dedupes webhook retries
  created_at      timestamptz not null default now(),
  unique (channel, external_id)
);

-- Saved personal details, reused across documents (see self_fields above).
-- Deleted by the /forget command.
create table if not exists public.agent_user_profiles (
  user_id     uuid primary key references public.agent_channel_users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,   -- {full_name, cin, birth_date, address, phone, email, city}
  updated_at  timestamptz not null default now()
);

create table if not exists public.agent_conversations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.agent_channel_users(id) on delete cascade,
  status            text not null default 'choosing'
                    check (status in ('choosing', 'collecting', 'confirming', 'done', 'cancelled')),
  document_type_id  uuid references public.document_types(id) on delete set null,
  candidate_ids     jsonb not null default '[]'::jsonb,  -- documents offered while choosing
  field_values      jsonb not null default '{}'::jsonb,  -- field_key -> value
  field_summaries   jsonb not null default '{}'::jsonb,  -- field_key -> Darija summary of a rewritten long text
  skipped_keys      jsonb not null default '[]'::jsonb,  -- optional fields the user declined
  asked_keys        jsonb not null default '[]'::jsonb,  -- fields asked in the last question
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_agent_conversations_user on public.agent_conversations(user_id, updated_at desc);

alter table public.agent_document_hints enable row level security;
alter table public.agent_field_hints enable row level security;
alter table public.agent_channel_users enable row level security;
alter table public.agent_user_profiles enable row level security;
alter table public.agent_conversations enable row level security;

-- --- Seed hints for the existing documents (never overwrites edits) ----------

insert into public.agent_document_hints (document_type_id, keywords, next_steps_ar, self_fields)
select dt.id, h.keywords, h.next_steps_ar, h.self_fields::jsonb
from (values
  ('شكاية إدارية',
   'شكاية، شكوى، تظلم، مشكل مع الإدارة، العامل، الوالي، القايد، الباشا، الجماعة، réclamation, plainte administrative',
   'اطبع الشكاية ووقّعها، صحّح الإمضاء في المقاطعة أو الجماعة إن طُلب منك، ثم ضعها في مكتب الضبط بالعمالة أو الإقليم واطلب وصل الإيداع، واحتفظ بنسخة.',
   '{"full_name":"اسم مقدم الشكاية","birth_date":"تاريخ الازدياد","cin":"رقم البطاقة الوطنية","address":"العنوان","phone":"رقم الهاتف","email":"البريد الإلكتروني","city":"المدينة"}'),
  ('شكاية بسبب الجار',
   'الجار، الجيران، ضجيج، صداع، الما، تسرب، الحيط، الضرر، voisin, bruit, fuite',
   'اطبع الشكاية ووقّعها، ثم ضعها لدى السلطة المحلية (القيادة أو الملحقة الإدارية) أو النيابة العامة، واطلب وصل الإيداع، واحتفظ بنسخة وبالصور إن وُجدت.',
   '{"full_name":"اسم مقدم الشكاية","cin":"رقم البطاقة الوطنية","address":"العنوان","phone":"رقم الهاتف","city":"المدينة"}'),
  ('توكيل عام',
   'وكالة، توكيل، نوكل، ينوب عليا، procuration',
   'اطبع الوكالة، ثم توجّه أنت (الموكل) إلى المقاطعة أو الجماعة لتصحيح الإمضاء ببطاقتك الوطنية، وسلّم نسخة للوكيل.',
   '{"full_name":"اسم الموكل","cin":"رقم البطاقة الوطنية — الموكل","address":"عنوان سكن الموكل"}'),
  ('عقد عمل',
   'عقد عمل، عقد شغل، خدمة، تشغيل، أجير، contrat de travail',
   'اطبع العقد في نسختين، يوقّعهما المشغل والأجير، ويُستحسن تصحيح الإمضاءين، ويحتفظ كل طرف بنسخة.',
   '{}'),
  ('عقد كراء سكني',
   'كراء، كرا، دار، شقة، مكري، مكتري، bail, location',
   'اطبع العقد في نسختين، يوقّعهما المكري والمكتري مع تصحيح الإمضاء، ويحتفظ كل طرف بنسخة.',
   '{}')
) as h(doc_name, keywords, next_steps_ar, self_fields)
join public.document_types dt on dt.name_ar = h.doc_name
on conflict (document_type_id) do nothing;

commit;
