-- ============================================================================
-- كاتب عمومي — Document templates (bodies + fields)
--
-- Run after schema.sql (fresh install) or after migrations/001_normalize_fields.sql
-- (existing database). Idempotent: it updates each document type by name and
-- upserts option lists, field definitions and document-field links by their
-- natural keys. Field keys are never renamed, so documents already saved in
-- users' history keep rendering correctly.
--
-- Wording follows the conventions of Moroccan administrative writing
-- (sender block on the right, city/date on the left, "سلام تام بوجود مولانا
-- الإمام"...) and the legal texts each contract relies on:
--   - عقد الكراء: القانون رقم 67.12 (المواد 3، 20...) والقانون رقم 07.03
--   - عقد الشغل: مدونة الشغل (القانون رقم 65.99)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Template bodies
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
<p style="text-align:center;font-weight:700;margin:28px 0 4px;">إلى السيد {{الجهة الموجهة إليها}} {{مقر الجهة}}</p>
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

-- ---------------------------------------------------------------------------
-- Option lists (each list of choices is stored once and shared)
--   - المدن: 79 main cities + «أخرى», which lets the user type any other town.
--   - العمالات والأقاليم: the 75 prefectures/provinces of the 2015 division, in
--     regional order; the text includes the type (عمالة / إقليم) so the letter
--     reads "عامل صاحب الجلالة على إقليم سطات".
-- ---------------------------------------------------------------------------

create temp table _lists (name text primary key, items jsonb not null) on commit drop;
insert into _lists (name, items) values
    ('المدن', '["الرباط","الدار البيضاء","فاس","مراكش","طنجة","سلا","مكناس","أكادير","وجدة","القنيطرة","تطوان","تمارة","آسفي","العيون","المحمدية","خريبكة","الجديدة","بني ملال","الناظور","تازة","الخميسات","برشيد","العرائش","القصر الكبير","سطات","بوجدور","الحسيمة","كلميم","الرشيدية","تاوريرت","إنزكان","أيت ملول","تارودانت","الصويرة","خنيفرة","سيدي قاسم","سيدي سليمان","بركان","وادي زم","صفرو","بنجرير","الفقيه بن صالح","قلعة السراغنة","تيزنيت","سيدي بنور","المضيق","الفنيدق","أصيلة","جرادة","جرسيف","الداخلة","طنطان","سيدي إفني","ميدلت","تنغير","زاكورة","بنسليمان","إفران","آزرو","بولمان","الحاجب","تاونات","الدريوش","بوعرفة","سوق الأربعاء الغرب","أزيلال","سوق السبت أولاد النمة","النواصر","مديونة","اليوسفية","شيشاوة","تحناوت","أرفود","بيوكرى","أولاد التايمة","آسا","السمارة","طرفاية","أوسرد","أخرى"]'::jsonb),
    ('العمالات والأقاليم', '["عمالة طنجة - أصيلة","عمالة المضيق - الفنيدق","إقليم الفحص - أنجرة","إقليم تطوان","إقليم الحسيمة","إقليم العرائش","إقليم شفشاون","إقليم وزان","عمالة وجدة - أنكاد","إقليم بركان","إقليم جرادة","إقليم الناظور","إقليم تاوريرت","إقليم الدريوش","إقليم جرسيف","إقليم فجيج","عمالة فاس","عمالة مكناس","إقليم بولمان","إقليم الحاجب","إقليم إفران","إقليم صفرو","إقليم تاونات","إقليم تازة","إقليم مولاي يعقوب","عمالة الرباط","عمالة سلا","عمالة الصخيرات - تمارة","إقليم القنيطرة","إقليم الخميسات","إقليم سيدي قاسم","إقليم سيدي سليمان","إقليم بني ملال","إقليم أزيلال","إقليم الفقيه بن صالح","إقليم خنيفرة","إقليم خريبكة","عمالة الدار البيضاء","عمالة المحمدية","إقليم بنسليمان","إقليم برشيد","إقليم الجديدة","إقليم مديونة","إقليم النواصر","إقليم سطات","إقليم سيدي بنور","عمالة مراكش","إقليم الحوز","إقليم شيشاوة","إقليم قلعة السراغنة","إقليم الصويرة","إقليم الرحامنة","إقليم آسفي","إقليم اليوسفية","إقليم الرشيدية","إقليم ميدلت","إقليم ورزازات","إقليم تنغير","إقليم زاكورة","عمالة أكادير إدا وتنان","عمالة إنزكان أيت ملول","إقليم اشتوكة أيت باها","إقليم تارودانت","إقليم تيزنيت","إقليم طاطا","إقليم كلميم","إقليم آسا - الزاك","إقليم سيدي إفني","إقليم طانطان","إقليم العيون","إقليم بوجدور","إقليم السمارة","إقليم طرفاية","إقليم وادي الذهب","إقليم أوسرد"]'::jsonb),
    ('صفات المسؤولين', '["عامل صاحب الجلالة على","الكاتب العام لـ","رئيس قسم الشؤون الداخلية بـ","رئيس مجلس"]'::jsonb),
    ('الجهات الموجهة إليها الشكاية', '["وكيل الملك لدى المحكمة الابتدائية بـ","باشا مدينة","قائد الملحقة الإدارية","قائد قيادة","رئيس مجلس جماعة","رئيس المنطقة الأمنية بـ","أخرى"]'::jsonb),
    ('مدد فترة الاختبار', '["15 يوماً","شهر واحد","شهر ونصف","شهرين","ثلاثة أشهر"]'::jsonb),
    ('مدد الكراء', '["ستة أشهر","سنة واحدة","سنتين","ثلاث سنوات"]'::jsonb);

insert into public.option_lists (name)
select name from _lists
on conflict (name) do nothing;

insert into public.option_list_items (list_id, value, sort_order)
select ol.id, v.value, v.ord
from _lists l
join public.option_lists ol on ol.name = l.name
cross join lateral jsonb_array_elements_text(l.items) with ordinality as v(value, ord)
on conflict (list_id, value) do update set sort_order = excluded.sort_order;

delete from public.option_list_items i
using public.option_lists ol, _lists l
where i.list_id = ol.id and ol.name = l.name
  and not (l.items ? i.value);

-- ---------------------------------------------------------------------------
-- Field catalog: what each field is, defined once
-- ---------------------------------------------------------------------------

create temp table _defs (
  field_key text primary key, label_ar text, field_type text, placeholder_ar text, list_name text
) on commit drop;
insert into _defs (field_key, label_ar, field_type, placeholder_ar, list_name) values
    ('المدينة', 'المدينة', 'select', '— اختر المدينة —', 'المدن'),
    ('مكان التحرير', 'مكان التحرير', 'select', '— اختر المدينة —', 'المدن'),
    ('تاريخ الشكاية', 'تاريخ الشكاية', 'date', '', null),
    ('اسم مقدم الشكاية', 'الاسم الكامل لمقدم الشكاية', 'varchar', 'الاسم العائلي والشخصي', null),
    ('تاريخ الازدياد', 'تاريخ الازدياد', 'date', '', null),
    ('رقم البطاقة الوطنية', 'رقم البطاقة الوطنية', 'cin', 'مثال: G754103', null),
    ('العنوان', 'العنوان', 'varchar', 'الحي، الزنقة، الرقم، المدينة', null),
    ('رقم الهاتف', 'رقم الهاتف', 'phone', '06XXXXXXXX', null),
    ('البريد الإلكتروني', 'البريد الإلكتروني', 'email', 'example@mail.com', null),
    ('صفة المسؤول', 'صفة المسؤول الموجهة إليه الشكاية', 'select', '— اختر —', 'صفات المسؤولين'),
    ('الإقليم / العمالة', 'العمالة / الإقليم', 'select', '— اختر العمالة أو الإقليم —', 'العمالات والأقاليم'),
    ('موضوع الشكاية', 'موضوع الشكاية', 'varchar', 'مثال: شكاية من أجل رفع الضرر', null),
    ('تفاصيل الشكاية', 'وقائع الشكاية بالتفصيل', 'text', 'اذكر الوقائع بتسلسل مع التواريخ والأماكن', null),
    ('ما تطلبه من الجهة المعنية', 'ما تلتمسه من الجهة المعنية', 'text', 'مثال: إيفاد لجنة للمعاينة ورفع الضرر', null),
    ('المرفقات', 'المرفقات (اختياري)', 'varchar', 'مثال: نسخة من البطاقة الوطنية، صور', null),
    ('الجهة الموجهة إليها', 'الجهة الموجهة إليها الشكاية', 'select', '— اختر الجهة —', 'الجهات الموجهة إليها الشكاية'),
    ('مقر الجهة', 'مقر الجهة أو دائرة نفوذها', 'varchar', 'مثال: سطات / الخامسة بسطات / أولاد سعيد', null),
    ('اسم الجار', 'اسم الجار المشتكى به', 'varchar', '', null),
    ('عنوان الجار', 'عنوان الجار', 'varchar', '', null),
    ('اسم الموكل', 'الاسم الكامل للموكل', 'varchar', 'الشخص الذي يمنح الوكالة', null),
    ('رقم البطاقة الوطنية — الموكل', 'رقم البطاقة الوطنية — الموكل', 'cin', 'مثال: G754103', null),
    ('عنوان سكن الموكل', 'عنوان سكن الموكل', 'varchar', '', null),
    ('اسم الوكيل', 'الاسم الكامل للوكيل', 'varchar', 'الشخص الذي سينوب عن الموكل', null),
    ('رقم البطاقة الوطنية — الوكيل', 'رقم البطاقة الوطنية — الوكيل', 'cin', 'مثال: G754103', null),
    ('عنوان سكن الوكيل', 'عنوان سكن الوكيل', 'varchar', '', null),
    ('تاريخ التوكيل', 'تاريخ التوكيل', 'date', '', null),
    ('اسم المشغل', 'اسم المشغل أو الشركة', 'varchar', 'مثال: شركة ... ش.م.م، في شخص ممثلها القانوني', null),
    ('عنوان المشغل', 'عنوان مقر المشغل', 'varchar', '', null),
    ('اسم الأجير', 'الاسم الكامل للأجير', 'varchar', '', null),
    ('عنوان الأجير', 'عنوان سكن الأجير', 'varchar', '', null),
    ('المنصب', 'المنصب / الوظيفة', 'varchar', 'مثال: محاسب', null),
    ('تاريخ بداية العمل', 'تاريخ بداية العمل', 'date', '', null),
    ('مدة فترة الاختبار', 'مدة فترة الاختبار (الحد الأقصى: 3 أشهر للأطر، شهر ونصف للمستخدمين، 15 يوماً للعمال)', 'select', '— اختر —', 'مدد فترة الاختبار'),
    ('مكان العمل', 'مكان العمل', 'varchar', 'مثال: مقر الشركة بالدار البيضاء', null),
    ('الأجرة الشهرية', 'الأجرة الشهرية الإجمالية (درهم)', 'int', '', null),
    ('تاريخ العقد', 'تاريخ العقد', 'date', '', null),
    ('اسم المكري', 'الاسم الكامل للمكري (المالك)', 'varchar', '', null),
    ('رقم البطاقة الوطنية — المكري', 'رقم البطاقة الوطنية — المكري', 'cin', 'مثال: G754103', null),
    ('عنوان المكري', 'عنوان المكري', 'varchar', '', null),
    ('اسم المكتري', 'الاسم الكامل للمكتري', 'varchar', '', null),
    ('رقم البطاقة الوطنية — المكتري', 'رقم البطاقة الوطنية — المكتري', 'cin', 'مثال: G754103', null),
    ('عنوان المحل', 'عنوان محل الكراء', 'varchar', 'الحي، الزنقة، الرقم، الطابق، المدينة', null),
    ('مكونات المحل', 'مكونات المحل', 'varchar', 'مثال: شقة من غرفتين وصالون ومطبخ وحمام', null),
    ('مدة الكراء', 'مدة الكراء', 'select', '— اختر —', 'مدد الكراء'),
    ('تاريخ بداية الكراء', 'تاريخ بداية الكراء', 'date', '', null),
    ('مبلغ الكراء', 'مبلغ الكراء الشهري (درهم)', 'int', '', null),
    ('مبلغ الضمانة', 'مبلغ الضمانة (درهم) — لا يتعدى شهرين', 'int', '', null);

insert into public.field_definitions (field_key, label_ar, field_type, placeholder_ar, option_list_id)
select d.field_key, d.label_ar, d.field_type, d.placeholder_ar, ol.id
from _defs d
left join public.option_lists ol on ol.name = d.list_name
on conflict (field_key) do update set
  label_ar = excluded.label_ar, field_type = excluded.field_type,
  placeholder_ar = excluded.placeholder_ar, option_list_id = excluded.option_list_id;

-- ---------------------------------------------------------------------------
-- Which fields each document asks for, in order. A label or placeholder is
-- given only where the document words it differently from the catalog.
-- ---------------------------------------------------------------------------

create temp table _links (
  doc_name text, field_key text, label_ar text, placeholder_ar text, is_required boolean, sort_order int
) on commit drop;
insert into _links (doc_name, field_key, label_ar, placeholder_ar, is_required, sort_order) values
    ('شكاية إدارية', 'المدينة', null, null, true, 1),
    ('شكاية إدارية', 'تاريخ الشكاية', null, null, true, 2),
    ('شكاية إدارية', 'اسم مقدم الشكاية', null, null, true, 3),
    ('شكاية إدارية', 'تاريخ الازدياد', null, null, true, 4),
    ('شكاية إدارية', 'رقم البطاقة الوطنية', null, null, true, 5),
    ('شكاية إدارية', 'العنوان', null, null, true, 6),
    ('شكاية إدارية', 'رقم الهاتف', null, null, true, 7),
    ('شكاية إدارية', 'البريد الإلكتروني', null, null, false, 8),
    ('شكاية إدارية', 'صفة المسؤول', null, null, true, 9),
    ('شكاية إدارية', 'الإقليم / العمالة', null, null, true, 10),
    ('شكاية إدارية', 'موضوع الشكاية', null, null, true, 11),
    ('شكاية إدارية', 'تفاصيل الشكاية', null, null, true, 12),
    ('شكاية إدارية', 'ما تطلبه من الجهة المعنية', null, null, true, 13),
    ('شكاية إدارية', 'المرفقات', null, null, false, 14),
    ('شكاية بسبب الجار', 'المدينة', null, null, true, 1),
    ('شكاية بسبب الجار', 'تاريخ الشكاية', null, null, true, 2),
    ('شكاية بسبب الجار', 'اسم مقدم الشكاية', null, null, true, 3),
    ('شكاية بسبب الجار', 'رقم البطاقة الوطنية', null, null, true, 4),
    ('شكاية بسبب الجار', 'العنوان', 'عنوانك', null, true, 5),
    ('شكاية بسبب الجار', 'رقم الهاتف', null, null, true, 6),
    ('شكاية بسبب الجار', 'الجهة الموجهة إليها', null, null, true, 7),
    ('شكاية بسبب الجار', 'مقر الجهة', null, null, true, 8),
    ('شكاية بسبب الجار', 'اسم الجار', null, null, true, 9),
    ('شكاية بسبب الجار', 'عنوان الجار', null, null, true, 10),
    ('شكاية بسبب الجار', 'موضوع الشكاية', 'سبب الشكاية باختصار', 'مثال: الإزعاج والضجيج المتكرر ليلاً', true, 11),
    ('شكاية بسبب الجار', 'تفاصيل الشكاية', 'تفاصيل الوقائع', 'اذكر الوقائع بتسلسل مع التواريخ', true, 12),
    ('توكيل عام', 'اسم الموكل', null, null, true, 1),
    ('توكيل عام', 'رقم البطاقة الوطنية — الموكل', null, null, true, 2),
    ('توكيل عام', 'عنوان سكن الموكل', null, null, true, 3),
    ('توكيل عام', 'اسم الوكيل', null, null, true, 4),
    ('توكيل عام', 'رقم البطاقة الوطنية — الوكيل', null, null, true, 5),
    ('توكيل عام', 'عنوان سكن الوكيل', null, null, true, 6),
    ('توكيل عام', 'مكان التحرير', null, null, true, 7),
    ('توكيل عام', 'تاريخ التوكيل', null, null, true, 8),
    ('عقد عمل', 'اسم المشغل', null, null, true, 1),
    ('عقد عمل', 'عنوان المشغل', null, null, true, 2),
    ('عقد عمل', 'اسم الأجير', null, null, true, 3),
    ('عقد عمل', 'رقم البطاقة الوطنية', 'رقم البطاقة الوطنية للأجير', null, true, 4),
    ('عقد عمل', 'عنوان الأجير', null, null, true, 5),
    ('عقد عمل', 'المنصب', null, null, true, 6),
    ('عقد عمل', 'تاريخ بداية العمل', null, null, true, 7),
    ('عقد عمل', 'مدة فترة الاختبار', null, null, true, 8),
    ('عقد عمل', 'مكان العمل', null, null, true, 9),
    ('عقد عمل', 'الأجرة الشهرية', null, null, true, 10),
    ('عقد عمل', 'مكان التحرير', null, null, true, 11),
    ('عقد عمل', 'تاريخ العقد', null, null, true, 12),
    ('عقد كراء سكني', 'اسم المكري', null, null, true, 1),
    ('عقد كراء سكني', 'رقم البطاقة الوطنية — المكري', null, null, true, 2),
    ('عقد كراء سكني', 'عنوان المكري', null, null, true, 3),
    ('عقد كراء سكني', 'اسم المكتري', null, null, true, 4),
    ('عقد كراء سكني', 'رقم البطاقة الوطنية — المكتري', null, null, true, 5),
    ('عقد كراء سكني', 'عنوان المحل', null, null, true, 6),
    ('عقد كراء سكني', 'مكونات المحل', null, null, true, 7),
    ('عقد كراء سكني', 'مدة الكراء', null, null, true, 8),
    ('عقد كراء سكني', 'تاريخ بداية الكراء', null, null, true, 9),
    ('عقد كراء سكني', 'مبلغ الكراء', null, null, true, 10),
    ('عقد كراء سكني', 'مبلغ الضمانة', null, null, true, 11),
    ('عقد كراء سكني', 'مكان التحرير', null, null, true, 12),
    ('عقد كراء سكني', 'تاريخ العقد', null, null, true, 13);

insert into public.document_type_fields (document_type_id, field_id, label_ar, placeholder_ar, is_required, sort_order)
select dt.id, fd.id, l.label_ar, l.placeholder_ar, l.is_required, l.sort_order
from _links l
join public.document_types dt on dt.name_ar = l.doc_name
join public.field_definitions fd on fd.field_key = l.field_key
on conflict (document_type_id, field_id) do update set
  label_ar = excluded.label_ar, placeholder_ar = excluded.placeholder_ar,
  is_required = excluded.is_required, sort_order = excluded.sort_order;

commit;
