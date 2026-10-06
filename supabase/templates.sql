-- ============================================================================
-- كاتب عمومي — Document templates (bodies + fields)
--
-- Idempotent: safe to run on a fresh database (after schema.sql) AND on an
-- existing one — it updates each document type by name and upserts its
-- fields by (document_type_id, field_key). Existing field keys are kept so
-- documents already saved in users' history keep rendering correctly.
--
-- Wording follows the conventions of Moroccan administrative writing
-- (sender block on the right, city/date on the left, "سلام تام بوجود مولانا
-- الإمام"...) and the legal texts each contract relies on:
--   - عقد الكراء: القانون رقم 67.12 (المواد 3، 20...) والقانون رقم 07.03
--   - عقد الشغل: مدونة الشغل (القانون رقم 65.99)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- شكاية إدارية
-- ---------------------------------------------------------------------------
update public.document_types set
  description_ar = 'شكاية موجهة إلى السيد العامل أو الوالي أو رئيس مصلحة إدارية',
  updated_at = now(),
  template_body = $tpl$<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;font-size:14px;line-height:1.9;color:#111;text-align:right;">
<table style="width:100%;border-collapse:collapse;"><tr>
<td style="width:60%;vertical-align:top;text-align:right;padding:0;">
الاسم الكامل: {{اسم مقدم الشكاية}}<br/>
المزداد(ة) بتاريخ: {{تاريخ الازدياد}}<br/>
رقم البطاقة الوطنية: {{رقم البطاقة الوطنية}}<br/>
العنوان: {{العنوان}}<br/>
الهاتف: {{رقم الهاتف}}<br/>
البريد الإلكتروني: {{البريد الإلكتروني}}
</td>
<td style="width:40%;vertical-align:top;text-align:left;padding:0;">{{المدينة}} في: {{تاريخ الشكاية}}</td>
</tr></table>
<p style="text-align:center;font-weight:700;margin:28px 0 4px;">إلى السيد {{صفة المسؤول}} {{الإقليم / العمالة}}</p>
<p style="text-align:center;font-weight:700;margin:0 0 20px;">المحترم</p>
<p style="margin:0 0 16px;"><strong><u>الموضوع:</u></strong> {{موضوع الشكاية}}</p>
<p style="margin:0 0 4px;">سلام تام بوجود مولانا الإمام المؤيد بالله،</p>
<p style="margin:0 0 12px;">وبعد،</p>
<p style="margin:0 0 12px;text-align:justify;">يشرفني، أنا الموقع(ة) أسفله {{اسم مقدم الشكاية}}، أن أتقدم إلى سيادتكم بهذه الشكاية، وأعرض عليكم ما يلي:</p>
<p style="margin:0 0 12px;text-align:justify;">{{تفاصيل الشكاية}}</p>
<p style="margin:0 0 12px;text-align:justify;">وعليه، والتماساً لإنصافي، أرجو من سيادتكم التفضل بالتدخل من أجل: {{ما تطلبه من الجهة المعنية}}</p>
<p style="margin:0 0 12px;text-align:justify;">وفي انتظار ردكم الإيجابي، تقبلوا سيدي فائق عبارات التقدير والاحترام.</p>
<p style="margin:0 0 12px;">والسلام.</p>
<p style="margin:0 0 4px;"><strong>المرفقات:</strong> {{المرفقات}}</p>
<table style="width:100%;border-collapse:collapse;margin-top:28px;"><tr>
<td style="width:50%;padding:0;"></td>
<td style="width:50%;text-align:center;padding:0;">إمضاء المشتكي(ة)<br/>{{اسم مقدم الشكاية}}</td>
</tr></table>
</div>$tpl$
where name_ar = 'شكاية إدارية';

insert into public.template_fields
  (document_type_id, field_key, label_ar, field_type, is_required, placeholder_ar, sort_order)
select d.id, f.k, f.l, f.t, f.r, f.p, f.o
from public.document_types d,
  (values
    ('المدينة', 'المدينة', 'varchar', true, 'مثال: سطات', 1),
    ('تاريخ الشكاية', 'تاريخ الشكاية', 'date', true, '', 2),
    ('اسم مقدم الشكاية', 'الاسم الكامل لمقدم الشكاية', 'varchar', true, 'الاسم العائلي والشخصي', 3),
    ('تاريخ الازدياد', 'تاريخ الازدياد', 'date', true, '', 4),
    ('رقم البطاقة الوطنية', 'رقم البطاقة الوطنية', 'cin', true, 'مثال: W123456', 5),
    ('العنوان', 'العنوان', 'varchar', true, 'الحي، الزنقة، الرقم، المدينة', 6),
    ('رقم الهاتف', 'رقم الهاتف', 'phone', true, '06XXXXXXXX', 7),
    ('البريد الإلكتروني', 'البريد الإلكتروني', 'email', false, 'example@mail.com', 8),
    ('صفة المسؤول', 'الجهة الموجهة إليها الشكاية', 'varchar', true, 'مثال: عامل صاحب الجلالة على إقليم', 9),
    ('الإقليم / العمالة', 'الإقليم / العمالة / الإدارة', 'varchar', true, 'مثال: سطات', 10),
    ('موضوع الشكاية', 'موضوع الشكاية', 'varchar', true, 'مثال: شكاية من أجل رفع الضرر', 11),
    ('تفاصيل الشكاية', 'وقائع الشكاية بالتفصيل', 'text', true, 'اذكر الوقائع بتسلسل مع التواريخ والأماكن', 12),
    ('ما تطلبه من الجهة المعنية', 'ما تلتمسه من الجهة المعنية', 'text', true, 'مثال: إيفاد لجنة للمعاينة ورفع الضرر', 13),
    ('المرفقات', 'المرفقات (اختياري)', 'varchar', false, 'مثال: نسخة من البطاقة الوطنية، صور', 14)
  ) as f(k, l, t, r, p, o)
where d.name_ar = 'شكاية إدارية'
on conflict (document_type_id, field_key) do update set
  label_ar = excluded.label_ar, field_type = excluded.field_type, is_required = excluded.is_required,
  placeholder_ar = excluded.placeholder_ar, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- شكاية بسبب الجار
-- ---------------------------------------------------------------------------
update public.document_types set
  description_ar = 'شكاية إلى السلطة المحلية أو النيابة العامة بسبب ضرر أو إزعاج من الجار',
  updated_at = now(),
  template_body = $tpl$<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;font-size:14px;line-height:1.9;color:#111;text-align:right;">
<table style="width:100%;border-collapse:collapse;"><tr>
<td style="width:60%;vertical-align:top;text-align:right;padding:0;">
المشتكي(ة): {{اسم مقدم الشكاية}}<br/>
رقم البطاقة الوطنية: {{رقم البطاقة الوطنية}}<br/>
العنوان: {{العنوان}}<br/>
الهاتف: {{رقم الهاتف}}
</td>
<td style="width:40%;vertical-align:top;text-align:left;padding:0;">{{المدينة}} في: {{تاريخ الشكاية}}</td>
</tr></table>
<p style="text-align:center;font-weight:700;margin:28px 0 4px;">إلى السيد {{الجهة الموجهة إليها}}</p>
<p style="text-align:center;font-weight:700;margin:0 0 20px;">المحترم</p>
<p style="margin:0 0 4px;"><strong><u>الموضوع:</u></strong> شكاية ضد الجار من أجل {{موضوع الشكاية}}</p>
<p style="margin:0 0 16px;"><strong><u>المشتكى به:</u></strong> {{اسم الجار}}، الساكن بـ {{عنوان الجار}}</p>
<p style="margin:0 0 4px;">سلام تام بوجود مولانا الإمام المؤيد بالله،</p>
<p style="margin:0 0 12px;">وبعد،</p>
<p style="margin:0 0 12px;text-align:justify;">يشرفني، أنا الموقع(ة) أسفله {{اسم مقدم الشكاية}}، الحامل(ة) لبطاقة التعريف الوطنية رقم {{رقم البطاقة الوطنية}}، الساكن(ة) بـ {{العنوان}}، أن أتقدم إلى سيادتكم بهذه الشكاية ضد جاري المذكور أعلاه، وذلك للأسباب التالية:</p>
<p style="margin:0 0 12px;text-align:justify;">{{تفاصيل الشكاية}}</p>
<p style="margin:0 0 12px;text-align:justify;">ونظراً لما ألحقه بي وبأسرتي هذا الوضع من ضرر، ورغم محاولاتي المتكررة لحل المشكل بطريقة ودية دون جدوى، فإنني ألتمس من سيادتكم التدخل العاجل لرفع الضرر، واستدعاء المشتكى به، واتخاذ ما ترونه مناسباً من إجراءات قانونية في حقه.</p>
<p style="margin:0 0 12px;text-align:justify;">وفي انتظار ذلك، تقبلوا سيدي فائق عبارات التقدير والاحترام.</p>
<p style="margin:0 0 12px;">والسلام.</p>
<table style="width:100%;border-collapse:collapse;margin-top:28px;"><tr>
<td style="width:50%;padding:0;"></td>
<td style="width:50%;text-align:center;padding:0;">إمضاء المشتكي(ة)<br/>{{اسم مقدم الشكاية}}</td>
</tr></table>
</div>$tpl$
where name_ar = 'شكاية بسبب الجار';

insert into public.template_fields
  (document_type_id, field_key, label_ar, field_type, is_required, placeholder_ar, sort_order)
select d.id, f.k, f.l, f.t, f.r, f.p, f.o
from public.document_types d,
  (values
    ('المدينة', 'المدينة', 'varchar', true, 'مثال: الدار البيضاء', 1),
    ('تاريخ الشكاية', 'تاريخ الشكاية', 'date', true, '', 2),
    ('اسم مقدم الشكاية', 'الاسم الكامل لمقدم الشكاية', 'varchar', true, 'الاسم العائلي والشخصي', 3),
    ('رقم البطاقة الوطنية', 'رقم البطاقة الوطنية', 'cin', true, 'مثال: BK123456', 4),
    ('العنوان', 'عنوانك', 'varchar', true, 'الحي، الزنقة، الرقم، المدينة', 5),
    ('رقم الهاتف', 'رقم الهاتف', 'phone', true, '06XXXXXXXX', 6),
    ('الجهة الموجهة إليها', 'الجهة الموجهة إليها الشكاية', 'varchar', true, 'مثال: قائد الملحقة الإدارية ... / وكيل الملك لدى المحكمة الابتدائية بـ...', 7),
    ('اسم الجار', 'اسم الجار المشتكى به', 'varchar', true, '', 8),
    ('عنوان الجار', 'عنوان الجار', 'varchar', true, '', 9),
    ('موضوع الشكاية', 'سبب الشكاية باختصار', 'varchar', true, 'مثال: الإزعاج والضجيج المتكرر ليلاً', 10),
    ('تفاصيل الشكاية', 'تفاصيل الوقائع', 'text', true, 'اذكر الوقائع بتسلسل مع التواريخ', 11)
  ) as f(k, l, t, r, p, o)
where d.name_ar = 'شكاية بسبب الجار'
on conflict (document_type_id, field_key) do update set
  label_ar = excluded.label_ar, field_type = excluded.field_type, is_required = excluded.is_required,
  placeholder_ar = excluded.placeholder_ar, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- توكيل عام (وكالة عامة)
-- ---------------------------------------------------------------------------
update public.document_types set
  description_ar = 'وكالة عامة للنيابة عن الموكل في الأمور الإدارية والقانونية — يجب تصحيح إمضاء الموكل',
  updated_at = now(),
  template_body = $tpl$<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;font-size:14px;line-height:1.9;color:#111;text-align:right;">
<p style="text-align:center;font-size:20px;font-weight:700;text-decoration:underline;margin:8px 0 24px;">وكالة عامة</p>
<p style="margin:0 0 12px;text-align:justify;">أنا الموقع(ة) أسفله: السيد(ة) <strong>{{اسم الموكل}}</strong>، المغربي(ة) الجنسية، الحامل(ة) لبطاقة التعريف الوطنية رقم <strong>{{رقم البطاقة الوطنية — الموكل}}</strong>، الساكن(ة) بـ {{عنوان سكن الموكل}}،</p>
<p style="margin:0 0 12px;text-align:justify;">أصرح، وأنا في كامل قواي العقلية والبدنية ودون إكراه، بأنني وكلت وفوضت بمقتضى هذه الوكالة:</p>
<p style="margin:0 0 12px;text-align:justify;">السيد(ة) <strong>{{اسم الوكيل}}</strong>، الحامل(ة) لبطاقة التعريف الوطنية رقم <strong>{{رقم البطاقة الوطنية — الوكيل}}</strong>، الساكن(ة) بـ {{عنوان سكن الوكيل}}،</p>
<p style="margin:0 0 8px;text-align:justify;">لينوب عني ويقوم مقامي في جميع أموري الإدارية والقانونية، وله على الخصوص:</p>
<p style="margin:0 0 6px;text-align:justify;">- تمثيلي أمام جميع الإدارات العمومية وشبه العمومية والجماعات الترابية والسلطات المحلية، وإيداع وسحب جميع الطلبات والوثائق والشهادات والرخص باسمي؛</p>
<p style="margin:0 0 6px;text-align:justify;">- تتبع الملفات المتعلقة بي لدى مختلف المصالح الإدارية والمحاكم، والاطلاع عليها والحصول على نسخ منها؛</p>
<p style="margin:0 0 6px;text-align:justify;">- تسلم المراسلات والطرود والإرساليات المضمونة الموجهة إلي؛</p>
<p style="margin:0 0 12px;text-align:justify;">- التوقيع نيابة عني على جميع المحررات والوثائق اللازمة لإنجاز ما ذكر.</p>
<p style="margin:0 0 12px;text-align:justify;">وبصفة عامة، القيام بكل ما يقتضيه تنفيذ هذه الوكالة، وأصرح بأنني أقر مسبقاً بكل ما يقوم به وكيلي المذكور في حدودها. وتبقى هذه الوكالة سارية المفعول إلى حين إلغائها كتابة من طرفي.</p>
<p style="margin:0 0 12px;text-align:justify;">وحررت هذه الوكالة لتقديمها عند الحاجة والإدلاء بها لدى من يلزم.</p>
<p style="margin:0 0 4px;text-align:left;">حرر بـ {{مكان التحرير}} في: {{تاريخ التوكيل}}</p>
<table style="width:100%;border-collapse:collapse;margin-top:28px;"><tr>
<td style="width:50%;text-align:center;padding:0;">إمضاء الوكيل<br/>(قبول الوكالة)</td>
<td style="width:50%;text-align:center;padding:0;">إمضاء الموكل(ة) مصادق عليه<br/>{{اسم الموكل}}</td>
</tr></table>
</div>$tpl$
where name_ar = 'توكيل عام';

insert into public.template_fields
  (document_type_id, field_key, label_ar, field_type, is_required, placeholder_ar, sort_order)
select d.id, f.k, f.l, f.t, f.r, f.p, f.o
from public.document_types d,
  (values
    ('اسم الموكل', 'الاسم الكامل للموكل', 'varchar', true, 'الشخص الذي يمنح الوكالة', 1),
    ('رقم البطاقة الوطنية — الموكل', 'رقم البطاقة الوطنية — الموكل', 'cin', true, 'مثال: G754103', 2),
    ('عنوان سكن الموكل', 'عنوان سكن الموكل', 'varchar', true, '', 3),
    ('اسم الوكيل', 'الاسم الكامل للوكيل', 'varchar', true, 'الشخص الذي سينوب عن الموكل', 4),
    ('رقم البطاقة الوطنية — الوكيل', 'رقم البطاقة الوطنية — الوكيل', 'cin', true, 'مثال: G754103', 5),
    ('عنوان سكن الوكيل', 'عنوان سكن الوكيل', 'varchar', true, '', 6),
    ('مكان التحرير', 'مكان التحرير', 'varchar', true, 'مثال: الرباط', 7),
    ('تاريخ التوكيل', 'تاريخ التوكيل', 'date', true, '', 8)
  ) as f(k, l, t, r, p, o)
where d.name_ar = 'توكيل عام'
on conflict (document_type_id, field_key) do update set
  label_ar = excluded.label_ar, field_type = excluded.field_type, is_required = excluded.is_required,
  placeholder_ar = excluded.placeholder_ar, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- عقد عمل (عقد شغل غير محدد المدة — مدونة الشغل)
-- ---------------------------------------------------------------------------
update public.document_types set
  description_ar = 'عقد شغل غير محدد المدة بين مشغل وأجير وفق مدونة الشغل',
  updated_at = now(),
  template_body = $tpl$<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;font-size:14px;line-height:1.9;color:#111;text-align:right;">
<p style="text-align:center;font-size:20px;font-weight:700;text-decoration:underline;margin:8px 0 4px;">عقد شغل</p>
<p style="text-align:center;margin:0 0 20px;">(غير محدد المدة)</p>
<p style="margin:0 0 4px;"><strong>بين الموقعين أسفله:</strong></p>
<p style="margin:0 0 8px;text-align:justify;"><strong>المشغل:</strong> {{اسم المشغل}}، الكائن مقره بـ {{عنوان المشغل}}، والمشار إليه فيما يلي بـ"المشغل"،</p>
<p style="margin:0 0 4px;">من جهة،</p>
<p style="margin:0 0 8px;text-align:justify;"><strong>والأجير:</strong> السيد(ة) {{اسم الأجير}}، الحامل(ة) لبطاقة التعريف الوطنية رقم {{رقم البطاقة الوطنية}}، الساكن(ة) بـ {{عنوان الأجير}}، والمشار إليه فيما يلي بـ"الأجير"،</p>
<p style="margin:0 0 16px;">من جهة أخرى،</p>
<p style="margin:0 0 12px;"><strong>تم الاتفاق والتراضي على ما يلي:</strong></p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الأول — موضوع العقد:</strong> يشغل المشغل الأجير، الذي يقبل، بصفة {{المنصب}}، لمدة غير محددة، ابتداءً من {{تاريخ بداية العمل}}.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الثاني — فترة الاختبار:</strong> يخضع الأجير لفترة اختبار مدتها {{مدة فترة الاختبار}}، يجوز خلالها لكل من الطرفين إنهاء العقد بإرادته دون أجل إخطار ولا تعويض، وذلك وفق مقتضيات مدونة الشغل.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الثالث — مكان العمل:</strong> يزاول الأجير عمله بـ {{مكان العمل}}.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الرابع — مدة العمل:</strong> تحدد مدة العمل في المدة القانونية المنصوص عليها في مدونة الشغل، أي 44 ساعة في الأسبوع بالنسبة للأنشطة غير الفلاحية، ويستفيد الأجير من الراحة الأسبوعية وأيام العطل المؤدى عنها طبقاً للقانون.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الخامس — الأجر:</strong> يتقاضى الأجير أجراً شهرياً إجمالياً قدره {{الأجرة الشهرية}} درهم، تقتطع منه الاقتطاعات القانونية والاجتماعية (الضمان الاجتماعي، التأمين الإجباري الأساسي عن المرض، الضريبة على الدخل)، ويؤدى في آخر كل شهر مقابل ورقة الأداء.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل السادس — الحماية الاجتماعية:</strong> يلتزم المشغل بالتصريح بالأجير لدى الصندوق الوطني للضمان الاجتماعي وبأداء الاشتراكات المستحقة.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل السابع — العطلة السنوية:</strong> يستفيد الأجير من عطلة سنوية مؤدى عنها بمعدل يوم ونصف يوم شغل فعلي عن كل شهر من الخدمة، طبقاً لمقتضيات مدونة الشغل.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الثامن — التزامات الأجير:</strong> يلتزم الأجير بأداء عمله بعناية وإخلاص، واحترام النظام الداخلي للمؤسسة وتعليمات المشغل، والمحافظة على السر المهني وعلى وسائل العمل الموضوعة رهن إشارته.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل التاسع — إنهاء العقد:</strong> لا يمكن إنهاء هذا العقد بعد انقضاء فترة الاختبار إلا وفق الشروط والإجراءات المنصوص عليها في مدونة الشغل، مع احترام أجل الإخطار.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل العاشر — مقتضيات عامة:</strong> كل ما لم يرد بشأنه نص في هذا العقد تطبق عليه مقتضيات مدونة الشغل (القانون رقم 65.99) والنصوص التنظيمية الجاري بها العمل.</p>
<p style="margin:16px 0 4px;text-align:left;">حرر في نظيرين بـ {{مكان التحرير}} في: {{تاريخ العقد}}</p>
<table style="width:100%;border-collapse:collapse;margin-top:28px;"><tr>
<td style="width:50%;text-align:center;padding:0;">إمضاء الأجير<br/>(مسبوق بعبارة "قرأت ووافقت")</td>
<td style="width:50%;text-align:center;padding:0;">إمضاء المشغل وخاتمه</td>
</tr></table>
</div>$tpl$
where name_ar = 'عقد عمل';

insert into public.template_fields
  (document_type_id, field_key, label_ar, field_type, is_required, placeholder_ar, sort_order)
select d.id, f.k, f.l, f.t, f.r, f.p, f.o
from public.document_types d,
  (values
    ('اسم المشغل', 'اسم المشغل أو الشركة', 'varchar', true, 'مثال: شركة ... ش.م.م، في شخص ممثلها القانوني', 1),
    ('عنوان المشغل', 'عنوان مقر المشغل', 'varchar', true, '', 2),
    ('اسم الأجير', 'الاسم الكامل للأجير', 'varchar', true, '', 3),
    ('رقم البطاقة الوطنية', 'رقم البطاقة الوطنية للأجير', 'cin', true, 'مثال: G754103', 4),
    ('عنوان الأجير', 'عنوان سكن الأجير', 'varchar', true, '', 5),
    ('المنصب', 'المنصب / الوظيفة', 'varchar', true, 'مثال: محاسب', 6),
    ('تاريخ بداية العمل', 'تاريخ بداية العمل', 'date', true, '', 7),
    ('مدة فترة الاختبار', 'مدة فترة الاختبار', 'varchar', true, 'الحد الأقصى: 3 أشهر للأطر، شهر ونصف للمستخدمين، 15 يوماً للعمال', 8),
    ('مكان العمل', 'مكان العمل', 'varchar', true, 'مثال: مقر الشركة بالدار البيضاء', 9),
    ('الأجرة الشهرية', 'الأجرة الشهرية الإجمالية (درهم)', 'int', true, '', 10),
    ('مكان التحرير', 'مكان التحرير', 'varchar', true, '', 11),
    ('تاريخ العقد', 'تاريخ العقد', 'date', true, '', 12)
  ) as f(k, l, t, r, p, o)
where d.name_ar = 'عقد عمل'
on conflict (document_type_id, field_key) do update set
  label_ar = excluded.label_ar, field_type = excluded.field_type, is_required = excluded.is_required,
  placeholder_ar = excluded.placeholder_ar, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- عقد كراء سكني (القانون رقم 67.12)
-- ---------------------------------------------------------------------------
update public.document_types set
  description_ar = 'عقد كراء محل معد للسكنى وفق القانون رقم 67.12 — يجب تصحيح إمضاء الطرفين',
  updated_at = now(),
  template_body = $tpl$<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;font-size:14px;line-height:1.9;color:#111;text-align:right;">
<p style="text-align:center;font-size:20px;font-weight:700;text-decoration:underline;margin:8px 0 4px;">عقد كراء محل معد للسكنى</p>
<p style="text-align:center;margin:0 0 20px;">(طبقاً لمقتضيات القانون رقم 67.12)</p>
<p style="margin:0 0 4px;"><strong>بين الموقعين أسفله:</strong></p>
<p style="margin:0 0 8px;text-align:justify;"><strong>المكري:</strong> السيد(ة) {{اسم المكري}}، الحامل(ة) لبطاقة التعريف الوطنية رقم {{رقم البطاقة الوطنية — المكري}}، الساكن(ة) بـ {{عنوان المكري}}،</p>
<p style="margin:0 0 4px;">من جهة،</p>
<p style="margin:0 0 8px;text-align:justify;"><strong>والمكتري:</strong> السيد(ة) {{اسم المكتري}}، الحامل(ة) لبطاقة التعريف الوطنية رقم {{رقم البطاقة الوطنية — المكتري}}،</p>
<p style="margin:0 0 16px;">من جهة أخرى،</p>
<p style="margin:0 0 12px;"><strong>تم الاتفاق والتراضي على ما يلي:</strong></p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الأول — محل الكراء:</strong> يكري المكري للمكتري، الذي يقبل، المحل الكائن بـ {{عنوان المحل}}، والمكون من {{مكونات المحل}}، وذلك قصد استعماله للسكنى الشخصية والعائلية للمكتري فقط.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الثاني — مدة الكراء:</strong> أبرم هذا العقد لمدة {{مدة الكراء}} تبتدئ من {{تاريخ بداية الكراء}}، ويتجدد تلقائياً لنفس المدة ما لم يتم إنهاؤه وفق الشروط المنصوص عليها في القانون رقم 67.12.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الثالث — الوجيبة الكرائية:</strong> حددت الوجيبة الكرائية في مبلغ {{مبلغ الكراء}} درهم شهرياً، يؤديها المكتري مسبقاً في بداية كل شهر، مقابل وصل يسلمه له المكري. ويتحمل المكتري مصاريف استهلاك الماء والكهرباء.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الرابع — الضمانة:</strong> سلم المكتري للمكري مبلغ {{مبلغ الضمانة}} درهم على سبيل الضمانة، لا يتعدى واجب شهرين من الوجيبة الكرائية طبقاً للمادة 20 من القانون رقم 67.12، ويسترجعه عند انتهاء العقد بعد تسليم المحل والتأكد من حالته وأداء جميع المستحقات.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الخامس — حالة المحل:</strong> يتسلم المكتري المحل في حالة جيدة صالحة للسكنى، ويحرر الطرفان بياناً وصفياً لحالته عند التسليم وعند الإرجاع، يوقعانه ويعتبر جزءاً لا يتجزأ من هذا العقد.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل السادس — التزامات المكري:</strong> يلتزم المكري بتسليم المحل وتوابعه في حالة جيدة، وبضمان الانتفاع الهادئ به، وبالقيام بالإصلاحات الضرورية التي لا يتحملها المكتري.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل السابع — التزامات المكتري:</strong> يلتزم المكتري بأداء الوجيبة الكرائية في أجلها، وباستعمال المحل وفق الغرض المعد له، وبالقيام بالإصلاحات الكرائية البسيطة، ولا يجوز له إحداث أي تغيير في المحل أو كراؤه من الباطن أو تولية الكراء إلا بموافقة كتابية من المكري.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الثامن — مراجعة الوجيبة:</strong> لا تتم مراجعة الوجيبة الكرائية إلا وفق الشروط المنصوص عليها قانوناً (القانون رقم 67.12 والقانون رقم 07.03)، مرة كل ثلاث سنوات على الأقل، وبنسبة لا تتجاوز 8% بالنسبة للمحلات المعدة للسكنى.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل التاسع — إنهاء العقد:</strong> يخضع إنهاء العقد والإفراغ لمقتضيات القانون رقم 67.12، ويلتزم المكتري عند مغادرته بإرجاع المحل بالحالة التي تسلمه عليها مع مراعاة التقادم العادي.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل العاشر — الاختصاص:</strong> في حالة نزاع، تختص بالبت فيه المحكمة الابتدائية التي يوجد المحل بدائرة نفوذها.</p>
<p style="margin:0 0 10px;text-align:justify;"><strong>الفصل الحادي عشر — ثبوت التاريخ:</strong> يصادق الطرفان على إمضائيهما في هذا العقد لدى الجهة المختصة لإكسابه تاريخاً ثابتاً طبقاً للمادة 3 من القانون رقم 67.12، ويتحملان مصاريف ذلك مناصفة.</p>
<p style="margin:16px 0 4px;text-align:left;">حرر في نظيرين بـ {{مكان التحرير}} في: {{تاريخ العقد}}</p>
<table style="width:100%;border-collapse:collapse;margin-top:28px;"><tr>
<td style="width:50%;text-align:center;padding:0;">إمضاء المكتري<br/>{{اسم المكتري}}</td>
<td style="width:50%;text-align:center;padding:0;">إمضاء المكري<br/>{{اسم المكري}}</td>
</tr></table>
</div>$tpl$
where name_ar = 'عقد كراء سكني';

insert into public.template_fields
  (document_type_id, field_key, label_ar, field_type, is_required, placeholder_ar, sort_order)
select d.id, f.k, f.l, f.t, f.r, f.p, f.o
from public.document_types d,
  (values
    ('اسم المكري', 'الاسم الكامل للمكري (المالك)', 'varchar', true, '', 1),
    ('رقم البطاقة الوطنية — المكري', 'رقم البطاقة الوطنية — المكري', 'cin', true, 'مثال: G754103', 2),
    ('عنوان المكري', 'عنوان المكري', 'varchar', true, '', 3),
    ('اسم المكتري', 'الاسم الكامل للمكتري', 'varchar', true, '', 4),
    ('رقم البطاقة الوطنية — المكتري', 'رقم البطاقة الوطنية — المكتري', 'cin', true, 'مثال: G754103', 5),
    ('عنوان المحل', 'عنوان محل الكراء', 'varchar', true, 'الحي، الزنقة، الرقم، الطابق، المدينة', 6),
    ('مكونات المحل', 'مكونات المحل', 'varchar', true, 'مثال: شقة من غرفتين وصالون ومطبخ وحمام', 7),
    ('مدة الكراء', 'مدة الكراء', 'varchar', true, 'مثال: سنة واحدة', 8),
    ('تاريخ بداية الكراء', 'تاريخ بداية الكراء', 'date', true, '', 9),
    ('مبلغ الكراء', 'مبلغ الكراء الشهري (درهم)', 'int', true, '', 10),
    ('مبلغ الضمانة', 'مبلغ الضمانة (درهم) — لا يتعدى شهرين', 'int', true, '', 11),
    ('مكان التحرير', 'مكان التحرير', 'varchar', true, '', 12),
    ('تاريخ العقد', 'تاريخ العقد', 'date', true, '', 13)
  ) as f(k, l, t, r, p, o)
where d.name_ar = 'عقد كراء سكني'
on conflict (document_type_id, field_key) do update set
  label_ar = excluded.label_ar, field_type = excluded.field_type, is_required = excluded.is_required,
  placeholder_ar = excluded.placeholder_ar, sort_order = excluded.sort_order;

commit;
