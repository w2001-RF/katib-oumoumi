-- ============================================================================
-- كاتب عمومي — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)
-- ============================================================================

-- --- Extensions ---------------------------------------------------------
create extension if not exists "pgcrypto";

-- --- Tables --------------------------------------------------------------

create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name_ar       text not null,
  icon          text not null default 'folder',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.document_types (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.categories(id) on delete cascade,
  name_ar         text not null,
  description_ar  text not null default '',
  icon            text not null default 'document',
  template_body   text not null default '',   -- HTML body with {{field_key}} placeholders
  usage_count     integer not null default 0,
  sort_order      integer not null default 0,
  is_published    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Reusable lists of choices for dropdown fields (cities, durations...).
-- Each list is stored once and shared by every field that uses it.
create table if not exists public.option_lists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  created_at    timestamptz not null default now()
);

create table if not exists public.option_list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references public.option_lists(id) on delete cascade,
  value         text not null,
  sort_order    integer not null default 0,
  unique (list_id, value)
);

-- Field catalog: one row per placeholder key. What a field *is* (its type,
-- default label/placeholder, choices) is defined here, once, and shared by
-- every document that uses it. Keys are global because documents store the
-- user's answers by key (see generated_documents.data).
create table if not exists public.field_definitions (
  id              uuid primary key default gen_random_uuid(),
  field_key       text not null unique,       -- used inside {{field_key}} in templates
  label_ar        text not null,
  field_type      text not null default 'varchar'
                  check (field_type in ('varchar','text','int','date','phone','email','cin','select')),
  placeholder_ar  text not null default '',
  option_list_id  uuid references public.option_lists(id) on delete restrict,
  created_at      timestamptz not null default now(),
  -- a dropdown must have a list of choices; no other type may have one
  constraint field_definitions_select_has_list check ((field_type = 'select') = (option_list_id is not null))
);

-- Which fields a document asks for. Holds only what is specific to the
-- document: order, required-ness and optional label/placeholder overrides
-- (NULL = use the catalog's).
create table if not exists public.document_type_fields (
  id                uuid primary key default gen_random_uuid(),
  document_type_id  uuid not null references public.document_types(id) on delete cascade,
  field_id          uuid not null references public.field_definitions(id) on delete restrict,
  label_ar          text,
  placeholder_ar    text,
  is_required       boolean not null default true,
  sort_order        integer not null default 0,
  unique (document_type_id, field_id)
);

-- The fields of a document with catalog defaults and overrides applied and
-- the dropdown choices inlined. This is what the app reads.
create or replace view public.v_template_fields
with (security_invoker = true) as
select
  dtf.id,
  dtf.document_type_id,
  dtf.field_id,
  fd.field_key,
  coalesce(dtf.label_ar, fd.label_ar)             as label_ar,
  fd.field_type,
  coalesce(dtf.placeholder_ar, fd.placeholder_ar) as placeholder_ar,
  dtf.is_required,
  dtf.sort_order,
  fd.option_list_id,
  ol.name                                         as option_list_name,
  coalesce(
    (select jsonb_agg(i.value order by i.sort_order, i.value)
       from public.option_list_items i where i.list_id = fd.option_list_id),
    '[]'::jsonb)                                  as options
from public.document_type_fields dtf
join public.field_definitions fd on fd.id = dtf.field_id
left join public.option_lists ol on ol.id = fd.option_list_id;

create table if not exists public.generated_documents (
  id                uuid primary key default gen_random_uuid(),
  document_type_id  uuid references public.document_types(id) on delete set null,
  session_id        text not null,            -- anonymous per-browser id, see js/session.js
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_document_types_category on public.document_types(category_id);
create index if not exists idx_doc_type_fields_doctype on public.document_type_fields(document_type_id);
create index if not exists idx_doc_type_fields_field on public.document_type_fields(field_id);
create index if not exists idx_field_definitions_list on public.field_definitions(option_list_id);
create index if not exists idx_generated_documents_session on public.generated_documents(session_id);

-- --- Helper: increment usage_count atomically -----------------------------
create or replace function public.increment_document_usage(doc_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.document_types set usage_count = usage_count + 1 where id = doc_id;
$$;

-- --- Row Level Security ----------------------------------------------------
alter table public.categories enable row level security;
alter table public.document_types enable row level security;
alter table public.option_lists enable row level security;
alter table public.option_list_items enable row level security;
alter table public.field_definitions enable row level security;
alter table public.document_type_fields enable row level security;
alter table public.generated_documents enable row level security;

-- Public (anon) read access — the whole point of the app for normal users
create policy "public read categories" on public.categories
  for select using (true);

create policy "public read document_types" on public.document_types
  for select using (is_published = true);

create policy "public read option_lists" on public.option_lists
  for select using (true);
create policy "public read option_list_items" on public.option_list_items
  for select using (true);
create policy "public read field_definitions" on public.field_definitions
  for select using (true);
create policy "public read document_type_fields" on public.document_type_fields
  for select using (true);

-- Anonymous users may log a document they generated, but only ever their own rows
create policy "public insert generated_documents" on public.generated_documents
  for insert with check (true);

-- Admin (any authenticated user — see README: keep this to a single account)
create policy "admin full access categories" on public.categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access document_types" on public.document_types
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access option_lists" on public.option_lists
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access option_list_items" on public.option_list_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access field_definitions" on public.field_definitions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access document_type_fields" on public.document_type_fields
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin read generated_documents" on public.generated_documents
  for select using (auth.role() = 'authenticated');

create policy "admin delete generated_documents" on public.generated_documents
  for delete using (auth.role() = 'authenticated');

grant execute on function public.increment_document_usage(uuid) to anon, authenticated;
grant select on public.v_template_fields to anon, authenticated;

-- ============================================================================
-- Seed data — mirrors the reference screenshots so the app works out of the box
-- ============================================================================

do $$
declare
  cat_complaints uuid;
  cat_poa uuid;
  cat_contracts uuid;
  cat_abroad uuid;
  cat_companies uuid;
  cat_procedures uuid;
  cat_certificates uuid;
  cat_family uuid;
  cat_requests uuid;

begin
  insert into public.categories (name_ar, icon, sort_order) values
    ('شكايات والظلامات', 'alert', 1) returning id into cat_complaints;
  insert into public.categories (name_ar, icon, sort_order) values
    ('وكالات وتوكيلات', 'userCheck', 2) returning id into cat_poa;
  insert into public.categories (name_ar, icon, sort_order) values
    ('عقود واتفاقيات', 'fileText', 3) returning id into cat_contracts;
  insert into public.categories (name_ar, icon, sort_order) values
    ('المعارية بالخارج', 'globe', 4) returning id into cat_abroad;
  insert into public.categories (name_ar, icon, sort_order) values
    ('الشركات والمقاولات', 'briefcase', 5) returning id into cat_companies;
  insert into public.categories (name_ar, icon, sort_order) values
    ('إجراءات إدارية', 'list', 6) returning id into cat_procedures;
  insert into public.categories (name_ar, icon, sort_order) values
    ('شهادات وإقرارات', 'checkCircle', 7) returning id into cat_certificates;
  insert into public.categories (name_ar, icon, sort_order) values
    ('وثائق عائلية', 'users', 8) returning id into cat_family;
  insert into public.categories (name_ar, icon, sort_order) values
    ('طلبات رسمية', 'send', 9) returning id into cat_requests;

  -- Document types. Their template bodies and fields live in
  -- supabase/templates.sql (run it right after this file).
  insert into public.document_types
    (category_id, name_ar, description_ar, icon, usage_count, sort_order) values
    (cat_complaints, 'شكاية إدارية', '', 'alert', 201, 1),
    (cat_complaints, 'شكاية بسبب الجار', '', 'alert', 156, 2),
    (cat_poa, 'توكيل عام', '', 'userCheck', 178, 1),
    (cat_contracts, 'عقد عمل', '', 'fileText', 112, 1),
    (cat_contracts, 'عقد كراء سكني', '', 'fileText', 142, 2);

end $$;
