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

create table if not exists public.template_fields (
  id                uuid primary key default gen_random_uuid(),
  document_type_id  uuid not null references public.document_types(id) on delete cascade,
  field_key         text not null,             -- used inside {{field_key}} in the template
  label_ar          text not null,
  field_type        text not null default 'varchar'
                    check (field_type in ('varchar','text','int','date','phone','email','cin')),
  is_required       boolean not null default true,
  placeholder_ar    text not null default '',
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  unique (document_type_id, field_key)
);

create table if not exists public.generated_documents (
  id                uuid primary key default gen_random_uuid(),
  document_type_id  uuid references public.document_types(id) on delete set null,
  session_id        text not null,            -- anonymous per-browser id, see js/session.js
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_document_types_category on public.document_types(category_id);
create index if not exists idx_template_fields_doctype on public.template_fields(document_type_id);
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
alter table public.template_fields enable row level security;
alter table public.generated_documents enable row level security;

-- Public (anon) read access — the whole point of the app for normal users
create policy "public read categories" on public.categories
  for select using (true);

create policy "public read document_types" on public.document_types
  for select using (is_published = true);

create policy "public read template_fields" on public.template_fields
  for select using (true);

-- Anonymous users may log a document they generated, but only ever their own rows
create policy "public insert generated_documents" on public.generated_documents
  for insert with check (true);

-- Admin (any authenticated user — see README: keep this to a single account)
create policy "admin full access categories" on public.categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access document_types" on public.document_types
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin full access template_fields" on public.template_fields
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin read generated_documents" on public.generated_documents
  for select using (auth.role() = 'authenticated');

create policy "admin delete generated_documents" on public.generated_documents
  for delete using (auth.role() = 'authenticated');

grant execute on function public.increment_document_usage(uuid) to anon, authenticated;

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
