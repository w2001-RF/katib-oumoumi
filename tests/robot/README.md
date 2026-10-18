# اختبارات Robot Framework (وظيفية + UAT)

اختبارات المتصفح للتطبيق كاملاً، بـ [Robot Framework](https://robotframework.org) ومكتبة
[Browser](https://robotframework-browser.org) (Playwright / Chromium).

التطبيق كيتشغّل محلياً مع **محاكي Supabase** ([`mock/supabase_mock.py`](mock/supabase_mock.py)): خادم
واحد كيقدّم ملفات التطبيق، و`supabase-config.js` موجّه ليه، ونسخة مبسطة من PostgREST (الجداول، العرض
`v_template_fields`، الدوال RPC)، وAuth (الدخول، تجديد الجلسة، الخروج) والدالة `agent-status`.
البيانات وهمية ([`mock/seed_data.py`](mock/seed_data.py)) وكتتعاود قبل كل اختبار، إذن **حتى اختبار
ما كيكتب فقاعدة البيانات الحقيقية** (dev وprod عندهم نفس القاعدة). سياسات RLS محاكية: الزائر كيقرا غير
الوثائق المنشورة وكيقدر يزيد غير فـ `generated_documents`.

## التثبيت (مرة وحدة)

```bash
pip install -r tests/robot/requirements.txt
rfbrowser init chromium          # كيحمّل Playwright وChromium (خاص Node.js)
```

> على Python 3.15، إلا فشل تثبيت PyYAML (ما كاينش wheel)، ثبّتو بلا امتداد C ومن بعد عاود الأمر الأول:
>
> - Bash: `PYYAML_FORCE_LIBYAML=0 pip install pyyaml`
> - PowerShell: `$env:PYYAML_FORCE_LIBYAML = "0"; pip install pyyaml; Remove-Item Env:PYYAML_FORCE_LIBYAML`
>
> إلا `robot` ولا `rfbrowser` ما تعرفوش (المجلد `Scripts` ماشي فـ PATH): `python -m robot …` و`python -m Browser.entry init chromium`.

## التشغيل

```bash
robot --exclude live --outputdir tests/robot/results tests/robot              # كلشي (≈ 2 دقايق)
robot --outputdir tests/robot/results tests/robot/functional/03_document_form.robot
robot --include admin --exclude live --outputdir tests/robot/results tests/robot
```

### تشوف المتصفح (headed)

بشكل افتراضي المتصفح ما كيبانش (headless). باش تشوفو كيخدم: `HEADLESS:False`، و`SLOW_MO` كيزيد وقفة
من بعد كل حركة باش تتبّع بعينيك (مثلاً `500ms`، الافتراضي `0s`):

```powershell
# suite وحدة
python -m robot --variable HEADLESS:False --variable SLOW_MO:500ms --outputdir tests/robot/results tests/robot/uat/01_citizen_journey.robot

# اختبار واحد بالسمية ديالو
python -m robot --variable HEADLESS:False --variable SLOW_MO:500ms --test "A Citizen Prepares, Downloads And Finds Again A Complaint" --outputdir tests/robot/results tests/robot/uat

# كلشي
python -m robot --variable HEADLESS:False --exclude live --outputdir tests/robot/results tests/robot
```

نفس الأوامر كتخدم بـ `robot` نيشان إلا كان المجلد `Scripts` ديال Python فـ PATH.

التقرير: `tests/robot/results/report.html` (وفيه لقطة شاشة لكل اختبار فشل).
فـ GitHub Actions: [`robot-tests.yml`](../../.github/workflows/robot-tests.yml) كيدوز مع كل push/PR
والتقرير كيتحمّل كـ artifact `robot-report`.

## المحتوى

| الملف | شنو كيختبر |
| --- | --- |
| `functional/01_home.robot` | الصفحة الرئيسية: الأكثر طلباً، البحث، الروابط، حالة الخطأ |
| `functional/02_categories.robot` | التصنيفات وعدد الوثائق المنشورة، صفحة التصنيف |
| `functional/03_document_form.robot` | الاستمارة: الحقول، التحقق (إلزامي، CIN، الهاتف، البريد)، القائمة مع البحث و«أخرى»، التوليد والتسجيل |
| `functional/04_ready_and_history.robot` | صفحة «الوثيقة جاهزة»: المعاينة، تحميل Word وPDF؛ السجل المحلي |
| `functional/05_navigation_settings.robot` | الشريط السفلي، الإعدادات، صفحة غير موجودة، RTL |
| `functional/10_admin_auth.robot` | دخول المسؤول، كلمة سر خاطئة، الخروج، حماية الصفحات، الرجوع للصفحة المطلوبة |
| `functional/11_admin_dashboard.robot` | الإحصائيات، الوثائق غير المنشورة، الحذف مع التأكيد |
| `functional/12_admin_categories.robot` | إضافة، تعديل وحذف التصنيفات (مع الوثائق المرتبطة) |
| `functional/13_admin_doctype_editor.robot` | محرر الوثائق: الحقول، القوائم الجديدة، القالب، المعاينة، أخطاء الحفظ |
| `functional/14_admin_agents.robot` | مراقبة الوكلاء: الأرقام، حالة البوت، تعليمات البوت (system prompt) |
| `functional/15_admin_session_expiry.robot` | انتهاء صلاحية JWT: تجديد شفاف، أو الرجوع لصفحة الدخول |
| `uat/01_citizen_journey.robot` | UAT: مواطن من الصفحة الرئيسية حتى تحميل الوثيقة والسجل |
| `uat/02_admin_publishes_document.robot` | UAT: المسؤول كينشر وثيقة جديدة، مواطن كيستعملها، المسؤول كيتبّع ويسحبها |
| `uat/03_live_smoke.robot` | UAT للموقع المنشور، **قراءة فقط** (tag `live`، ما كيدوزش بشكل افتراضي) |

الموقع المنشور (قراءة فقط، حتى حاجة ما كتتصيفط):

```bash
robot --include live --variable LIVE_URL:https://katiboumoumi.online --outputdir tests/robot/results/live tests/robot/uat
```

## زيادة اختبار

- الكلمات المشتركة فـ [`resources/katib.resource`](resources/katib.resource): `Open Fresh App`،
  `Sign In As Admin`، `Choose Combo Option` (القوائم مع البحث)، `Fill Neighbour Complaint`، `Download Should Be Saved`…
- التحكم فالمحاكي من الاختبار ([`libraries/KatibMock.py`](libraries/KatibMock.py)): `Get Row` / `Row Count Should Be`
  (شنو تكتب فالقاعدة)، `Fail Next Requests` (خطأ من الخادم)، `Expire Admin Session` (JWT منتهي)، `Requests Made`.
- المحاكي يقدر يخدم بوحدو للتجربة اليدوية: `python tests/robot/mock/supabase_mock.py 8765`
  ثم `http://127.0.0.1:8765` (المسؤول: `admin@katib.test` / `Robot-Pass-2026`).
