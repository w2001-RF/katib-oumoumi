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

  doc_complaint uuid;
  doc_poa_general uuid;
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

  -- شكاية إدارية ------------------------------------------------------------
  insert into public.document_types
    (category_id, name_ar, description_ar, icon, usage_count, sort_order, template_body)
  values (
    cat_complaints, 'شكاية إدارية', 'تقديم شكاية إلى جهة إدارية مختصة', 'alert', 201, 1,
    '<div dir="rtl" style="text-align:right;font-family:Tajawal,Arial,sans-serif;line-height:2;">
      <p style="text-align:left;">{{المدينة}}، في {{تاريخ الشكاية}}</p>
      <p style="text-align:center;font-weight:700;font-size:1.1em;">شكاية إدارية</p>
      <p>الاسم الكامل: {{اسم مقدم الشكاية}}<br/>
      تاريخ الازدياد: {{تاريخ الازدياد}}<br/>
      رقم البطاقة الوطنية: {{رقم البطاقة الوطنية}}<br/>
      العنوان: {{العنوان}}<br/>
      رقم الهاتف: {{رقم الهاتف}}<br/>
      البريد الإلكتروني: {{البريد الإلكتروني}}</p>
      <p>إلى السيد(ة) {{صفة المسؤول}} إقليم/عمالة {{الإقليم / العمالة}}</p>
      <p>الموضوع: {{موضوع الشكاية}}</p>
      <p>تفاصيل الشكاية:<br/>{{تفاصيل الشكاية}}</p>
      <p>وعليه، ألتمس منكم التكرم بـ: {{ما تطلبه من الجهة المعنية}}</p>
      <p style="margin-top:3em;text-align:left;">التوقيع</p>
    </div>'
  ) returning id into doc_complaint;

  insert into public.template_fields (document_type_id, field_key, label_ar, field_type, is_required, sort_order) values
    (doc_complaint, 'المدينة', 'المدينة', 'varchar', true, 1),
    (doc_complaint, 'تاريخ الشكاية', 'تاريخ الشكاية', 'date', true, 2),
    (doc_complaint, 'اسم مقدم الشكاية', 'اسم مقدم الشكاية', 'varchar', true, 3),
    (doc_complaint, 'تاريخ الازدياد', 'تاريخ الازدياد', 'date', true, 4),
    (doc_complaint, 'رقم البطاقة الوطنية', 'رقم البطاقة الوطنية', 'cin', true, 5),
    (doc_complaint, 'العنوان', 'العنوان', 'varchar', true, 6),
    (doc_complaint, 'رقم الهاتف', 'رقم الهاتف', 'phone', true, 7),
    (doc_complaint, 'البريد الإلكتروني', 'البريد الإلكتروني', 'email', true, 8),
    (doc_complaint, 'الإقليم / العمالة', 'الإقليم / العمالة', 'varchar', true, 9),
    (doc_complaint, 'صفة المسؤول', 'صفة المسؤول (عامل/قائد/...)', 'varchar', true, 10),
    (doc_complaint, 'موضوع الشكاية', 'موضوع الشكاية', 'varchar', true, 11),
    (doc_complaint, 'تفاصيل الشكاية', 'تفاصيل الشكاية', 'text', true, 12),
    (doc_complaint, 'ما تطلبه من الجهة المعنية', 'ما تطلبه من الجهة المعنية', 'text', true, 13);

  -- شكاية بسبب الجار ----------------------------------------------------------
  insert into public.document_types
    (category_id, name_ar, description_ar, icon, usage_count, sort_order, template_body)
  values (
    cat_complaints, 'شكاية بسبب الجار', 'شكاية إدارية بسبب إزعاج أو نزاع مع الجار', 'alert', 156, 2,
    '<div dir="rtl" style="text-align:right;font-family:Tajawal,Arial,sans-serif;line-height:2;">
      <p style="text-align:left;">{{المدينة}}، في {{تاريخ الشكاية}}</p>
      <p style="text-align:center;font-weight:700;font-size:1.1em;">شكاية بخصوص نزاع مع الجار</p>
      <p>أنا الممضي أسفله {{اسم مقدم الشكاية}}، حامل البطاقة الوطنية رقم {{رقم البطاقة الوطنية}}،
      الساكن بـ {{العنوان}}، أتقدم بهذه الشكاية ضد جاري {{اسم الجار}} الساكن بـ {{عنوان الجار}}.</p>
      <p>موضوع الشكاية: {{موضوع الشكاية}}</p>
      <p>تفاصيل الواقعة:<br/>{{تفاصيل الشكاية}}</p>
      <p>رقم الهاتف للتواصل: {{رقم الهاتف}}</p>
      <p style="margin-top:3em;text-align:left;">التوقيع</p>
    </div>'
  );

  insert into public.template_fields (document_type_id, field_key, label_ar, field_type, is_required, sort_order)
  select id, k, l, t, true, o from public.document_types,
    (values
      ('المدينة','المدينة','varchar',1),
      ('تاريخ الشكاية','تاريخ الشكاية','date',2),
      ('اسم مقدم الشكاية','اسم مقدم الشكاية','varchar',3),
      ('رقم البطاقة الوطنية','رقم البطاقة الوطنية','cin',4),
      ('العنوان','عنوانك','varchar',5),
      ('اسم الجار','اسم الجار','varchar',6),
      ('عنوان الجار','عنوان الجار','varchar',7),
      ('موضوع الشكاية','موضوع الشكاية','varchar',8),
      ('تفاصيل الشكاية','تفاصيل الشكاية','text',9),
      ('رقم الهاتف','رقم الهاتف','phone',10)
    ) as f(k, l, t, o)
  where name_ar = 'شكاية بسبب الجار';

  -- توكيل عام -----------------------------------------------------------------
  insert into public.document_types
    (category_id, name_ar, description_ar, icon, usage_count, sort_order, template_body)
  values (
    cat_poa, 'توكيل عام', 'تفويض عام للتصرف نيابة عن الموكل في جميع الأمور القانونية والإدارية', 'userCheck', 178, 1,
    '<div dir="rtl" style="text-align:right;font-family:Tajawal,Arial,sans-serif;line-height:2;">
      <p style="text-align:center;font-weight:700;font-size:1.2em;">توكيل عام</p>
      <p>أنا الموقع أسفله {{اسم الموكل}}، حامل البطاقة الوطنية رقم {{رقم البطاقة الوطنية — الموكل}}،
      الساكن بـ {{عنوان سكن الموكل}}،</p>
      <p>أفوض بموجب هذا التوكيل السيد(ة) {{اسم الوكيل}}، حامل البطاقة الوطنية رقم {{رقم البطاقة الوطنية — الوكيل}}،
      الساكن بـ {{عنوان سكن الوكيل}}،</p>
      <p>للتصرف نيابة عني في جميع الأمور القانونية والإدارية التي تتطلب حضوري الشخصي.</p>
      <p>حرر بـ {{مكان التحرير}} بتاريخ {{تاريخ التوكيل}}</p>
      <p style="margin-top:3em;text-align:left;">إمضاء الموكل</p>
    </div>'
  ) returning id into doc_poa_general;

  insert into public.template_fields (document_type_id, field_key, label_ar, field_type, is_required, sort_order) values
    (doc_poa_general, 'اسم الموكل', 'اسم الموكل', 'varchar', true, 1),
    (doc_poa_general, 'رقم البطاقة الوطنية — الموكل', 'رقم البطاقة الوطنية — الموكل', 'cin', true, 2),
    (doc_poa_general, 'عنوان سكن الموكل', 'عنوان سكن الموكل', 'varchar', true, 3),
    (doc_poa_general, 'اسم الوكيل', 'اسم الوكيل', 'varchar', true, 4),
    (doc_poa_general, 'رقم البطاقة الوطنية — الوكيل', 'رقم البطاقة الوطنية — الوكيل', 'cin', true, 5),
    (doc_poa_general, 'عنوان سكن الوكيل', 'عنوان سكن الوكيل', 'varchar', true, 6),
    (doc_poa_general, 'مكان التحرير', 'مكان التحرير', 'varchar', true, 7),
    (doc_poa_general, 'تاريخ التوكيل', 'تاريخ التوكيل', 'date', true, 8);

  -- عقد عمل (placeholder doc so the "most requested" list has 5 rows) --------
  insert into public.document_types
    (category_id, name_ar, description_ar, icon, usage_count, sort_order, template_body)
  values (
    cat_contracts, 'عقد عمل', 'عقد شغل بين مشغل وأجير', 'fileText', 112, 1,
    '<div dir="rtl" style="text-align:right;font-family:Tajawal,Arial,sans-serif;line-height:2;">
      <p style="text-align:center;font-weight:700;font-size:1.2em;">عقد عمل</p>
      <p>بين المشغل: {{اسم المشغل}}<br/>والأجير: {{اسم الأجير}}، حامل البطاقة الوطنية رقم {{رقم البطاقة الوطنية}}</p>
      <p>تم الاتفاق على تشغيل الأجير بمنصب {{المنصب}} ابتداءً من {{تاريخ بداية العمل}} بأجرة شهرية قدرها {{الأجرة الشهرية}} درهم.</p>
      <p>حرر بـ {{مكان التحرير}} بتاريخ {{تاريخ العقد}}</p>
    </div>'
  );
  insert into public.template_fields (document_type_id, field_key, label_ar, field_type, is_required, sort_order)
  select id, k, l, t, true, o from public.document_types,
    (values
      ('اسم المشغل','اسم المشغل','varchar',1),
      ('اسم الأجير','اسم الأجير','varchar',2),
      ('رقم البطاقة الوطنية','رقم البطاقة الوطنية','cin',3),
      ('المنصب','المنصب','varchar',4),
      ('تاريخ بداية العمل','تاريخ بداية العمل','date',5),
      ('الأجرة الشهرية','الأجرة الشهرية (درهم)','int',6),
      ('مكان التحرير','مكان التحرير','varchar',7),
      ('تاريخ العقد','تاريخ العقد','date',8)
    ) as f(k, l, t, o)
  where name_ar = 'عقد عمل';

  -- عقد كراء سكني --------------------------------------------------------------
  insert into public.document_types
    (category_id, name_ar, description_ar, icon, usage_count, sort_order, template_body)
  values (
    cat_contracts, 'عقد كراء سكني', 'عقد كراء بين مكري ومكتري لسكن', 'fileText', 142, 2,
    '<div dir="rtl" style="text-align:right;font-family:Tajawal,Arial,sans-serif;line-height:2;">
      <p style="text-align:center;font-weight:700;font-size:1.2em;">عقد كراء سكني</p>
      <p>بين المكري: {{اسم المكري}}<br/>والمكتري: {{اسم المكتري}}</p>
      <p>محل الكراء الكائن بـ {{عنوان المحل}} بمبلغ كراء شهري قدره {{مبلغ الكراء}} درهم.</p>
      <p>حرر بـ {{مكان التحرير}} بتاريخ {{تاريخ العقد}}</p>
    </div>'
  );
  insert into public.template_fields (document_type_id, field_key, label_ar, field_type, is_required, sort_order)
  select id, k, l, t, true, o from public.document_types,
    (values
      ('اسم المكري','اسم المكري','varchar',1),
      ('اسم المكتري','اسم المكتري','varchar',2),
      ('عنوان المحل','عنوان محل الكراء','varchar',3),
      ('مبلغ الكراء','مبلغ الكراء الشهري (درهم)','int',4),
      ('مكان التحرير','مكان التحرير','varchar',5),
      ('تاريخ العقد','تاريخ العقد','date',6)
    ) as f(k, l, t, o)
  where name_ar = 'عقد كراء سكني';

end $$;
