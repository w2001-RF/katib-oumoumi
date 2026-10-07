-- ============================================================================
-- Migration 001 — normalize template fields
--
-- Run ONCE, in the Supabase SQL editor, on a database created from the old
-- schema.sql (the one with a single wide `template_fields` table). Fresh
-- installs do not need it: schema.sql already creates the new structure.
-- Afterwards, run supabase/templates.sql again.
--
-- Old:  template_fields(document_type_id, field_key, label_ar, field_type,
--                       options jsonb, placeholder_ar, is_required, sort_order)
--       -> the same field (label, type, choices) repeated in every document,
--          and the same city list copied into every row that uses it.
-- New:  option_lists / option_list_items   each list of choices stored once
--       field_definitions                  one row per field key
--       document_type_fields               which document uses which field
--       v_template_fields (view)           flat shape the app reads
--
-- All-or-nothing: if anything fails, nothing is changed. Re-running it after
-- success fails immediately (there is no `template_fields` table anymore).
-- ============================================================================

begin;

-- Databases created before dropdown fields existed have no `options` column.
alter table public.template_fields add column if not exists options jsonb not null default '[]'::jsonb;

-- Fields that share a key are merged into one definition, so they must agree
-- on their type and on their choices. (Label and placeholder may differ:
-- those become per-document overrides.)
do $$
declare
  conflicts text;
begin
  select string_agg(field_key, '، ') into conflicts from (
    select field_key from public.template_fields
    group by field_key
    having count(distinct field_type) > 1
        or count(distinct options) filter (where field_type = 'select') > 1
  ) t;
  if conflicts is not null then
    raise exception 'Same field key with a different type or different choices in several documents: %. Make them consistent (or rename one key), then run this migration again.', conflicts;
  end if;
end $$;

alter table public.template_fields rename to template_fields_legacy;

-- --- New structure (identical to schema.sql) ---------------------------------

create table public.option_lists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  created_at    timestamptz not null default now()
);

create table public.option_list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references public.option_lists(id) on delete cascade,
  value         text not null,
  sort_order    integer not null default 0,
  unique (list_id, value)
);

create table public.field_definitions (
  id              uuid primary key default gen_random_uuid(),
  field_key       text not null unique,
  label_ar        text not null,
  field_type      text not null default 'varchar'
                  check (field_type in ('varchar','text','int','date','phone','email','cin','select')),
  placeholder_ar  text not null default '',
  option_list_id  uuid references public.option_lists(id) on delete restrict,
  created_at      timestamptz not null default now(),
  constraint field_definitions_select_has_list check ((field_type = 'select') = (option_list_id is not null))
);

create table public.document_type_fields (
  id                uuid primary key default gen_random_uuid(),
  document_type_id  uuid not null references public.document_types(id) on delete cascade,
  field_id          uuid not null references public.field_definitions(id) on delete restrict,
  label_ar          text,
  placeholder_ar    text,
  is_required       boolean not null default true,
  sort_order        integer not null default 0,
  unique (document_type_id, field_id)
);

create index idx_doc_type_fields_doctype on public.document_type_fields(document_type_id);
create index idx_doc_type_fields_field on public.document_type_fields(field_id);
create index idx_field_definitions_list on public.field_definitions(option_list_id);

create view public.v_template_fields
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

alter table public.option_lists enable row level security;
alter table public.option_list_items enable row level security;
alter table public.field_definitions enable row level security;
alter table public.document_type_fields enable row level security;

create policy "public read option_lists" on public.option_lists for select using (true);
create policy "public read option_list_items" on public.option_list_items for select using (true);
create policy "public read field_definitions" on public.field_definitions for select using (true);
create policy "public read document_type_fields" on public.document_type_fields for select using (true);

create policy "admin full access option_lists" on public.option_lists
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access option_list_items" on public.option_list_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access field_definitions" on public.field_definitions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access document_type_fields" on public.document_type_fields
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select on public.v_template_fields to anon, authenticated;

-- --- Data ----------------------------------------------------------------------

-- 1. One option list per distinct set of choices (the city list that was
--    copied into several rows becomes a single list).
create temp table _lists on commit drop as
select
  gen_random_uuid() as id,
  options,
  base || case when row_number() over (partition by base order by options::text) > 1
               then ' ' || row_number() over (partition by base order by options::text)
               else '' end as name
from (
  select
    options,
    case
      when bool_or(field_key in ('المدينة', 'مكان التحرير')) then 'المدن'
      when bool_or(field_key = 'الإقليم / العمالة') then 'العمالات والأقاليم'
      when bool_or(field_key = 'صفة المسؤول') then 'صفات المسؤولين'
      when bool_or(field_key = 'الجهة الموجهة إليها') then 'الجهات الموجهة إليها الشكاية'
      when bool_or(field_key = 'مدة فترة الاختبار') then 'مدد فترة الاختبار'
      when bool_or(field_key = 'مدة الكراء') then 'مدد الكراء'
      else 'قائمة ' || min(field_key)
    end as base
  from public.template_fields_legacy
  where field_type = 'select'
  group by options
) x;

insert into public.option_lists (id, name) select id, name from _lists;

insert into public.option_list_items (list_id, value, sort_order)
select l.id, v.value, v.ord
from _lists l, jsonb_array_elements_text(l.options) with ordinality as v(value, ord)
on conflict do nothing;

-- 2. One definition per field key; the most common label/placeholder wins.
insert into public.field_definitions (field_key, label_ar, field_type, placeholder_ar, option_list_id)
select
  t.field_key,
  mode() within group (order by t.label_ar),
  min(t.field_type),
  coalesce(mode() within group (order by t.placeholder_ar), ''),
  min(l.id::text)::uuid
from public.template_fields_legacy t
left join _lists l on t.field_type = 'select' and l.options = t.options
group by t.field_key;

-- 3. Link documents to definitions, keeping a label/placeholder only where it
--    differs from the definition's.
insert into public.document_type_fields
  (document_type_id, field_id, label_ar, placeholder_ar, is_required, sort_order)
select
  t.document_type_id,
  d.id,
  case when t.label_ar is distinct from d.label_ar then t.label_ar end,
  case when t.placeholder_ar is distinct from d.placeholder_ar then t.placeholder_ar end,
  t.is_required,
  t.sort_order
from public.template_fields_legacy t
join public.field_definitions d on d.field_key = t.field_key;

drop table public.template_fields_legacy;

commit;
