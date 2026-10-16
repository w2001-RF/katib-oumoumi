# الوكيل الذكي (بوت تيليغرام) — AI agent

بوت يوجّد نفس الوثائق ديال التطبيق انطلاقاً من **وصف بالكتابة، رسالة صوتية، أو تصويرة**
(البطاقة الوطنية، رسالة توصل بها المستخدم...)، ويسوّل على المعلومات الناقصة حتى تكمل الوثيقة،
ثم يرسل ملف PDF. موجّه بالخصوص للأشخاص الأميين والمكفوفين.

**التطبيق**: <https://katiboumoumi.online/> · **لوحة مراقبة الوكلاء**: <https://katiboumoumi.online/#/admin/agents>

**المخططات**: [البنية العامة للنظام](diagrams/system-architecture.html) ·
[مسار المحادثة مع البوت](diagrams/agent-workflow.html) — انظر [`docs/diagrams/`](diagrams/README.md).

## المبدأ

- **القوالب والحقول هي نفسها ديال التطبيق** (`document_types`, `v_template_fields`): أي وثيقة يضيفها
  المسؤول من لوحة التحكم تصبح متاحة للبوت تلقائياً.
- **الخادم هو اللي كيقرر، ماشي النموذج**: آلة حالات (`engine.ts`) كتعرف شنو ناقص من الحقول الإلزامية،
  وكتتحقق من القيم بنفس `js/utils/validators.js` ديال التطبيق. النموذج كيدير غير 4 مهام بسيطة بجواب JSON
  (`tasks.ts`): تحديد الوثيقة، استخراج القيم، صياغة السؤال، وإعادة صياغة الوقائع بالعربية الإدارية.
  لهذا يخدم مع **أي نموذج**: Gemini المجاني، Llama على Groq، Qwen محلي على Ollama، Claude...
- **نماذج محلية (Ollama)**: على نفس الجهاز، الشبكة المحلية، سيرفر خاص بـ GPU، أو ollama.com، عبر الـ API الأصلي
  ديال Ollama. الإعداد، الربط بالشبكة والحماية: [`docs/ollama.md`](ollama.md).
- **واجهة واحدة لكل المزودين**: صيغة OpenAI Chat Completions، عبر 3 متغيرات (`LLM_BASE_URL`, `LLM_API_KEY`,
  `LLM_MODEL`). انظر [`supabase/functions/.env.example`](../supabase/functions/.env.example).
- **الموافقة أولاً**: ما كيتصيفط والو لأي مزود ذكاء اصطناعي قبل ما يوافق المستخدم. `/forget` كيمسح معلوماته.

```
supabase/functions/
  telegram-webhook/index.ts     نقطة الدخول (Webhook)
  _shared/ai/                   طبقة النماذج: واجهة موحدة، fallback، STT/TTS، القدرات
  _shared/agent/                آلة الحالات، المهام الأربع، التخزين، النصوص الثابتة
  _shared/channels/             تيليغرام (وواتساب لاحقاً بنفس الواجهة)
  _shared/docs/render.ts        PDF عبر Gotenberg (Chromium)، أو ملف HTML قابل للطباعة
eval/                           تقييم النماذج على حالات (بيانات وهمية)
supabase/migrations/002_ai_agent.sql
```

## 1. قاعدة البيانات

نفّذ مرة واحدة [`supabase/migrations/002_ai_agent.sql`](../supabase/migrations/002_ai_agent.sql) في SQL Editor.
**إضافي فقط**: كينشئ جداول `agent_*` جديدة، وما كيبدّل حتى جدول أو عمود أو سياسة موجودة،
فالتطبيق الحالي ما كيتأثرش. قابل لإعادة التنفيذ، وطريقة الحذف مكتوبة في رأس الملف.

- `agent_document_hints`: كلمات مفتاحية لكل وثيقة، "شنو تدير من بعد"، و`self_fields` (الحقول اللي كتخص
  المستخدم نفسه، باش نعاودو نستعملو معلوماته). مهم: `رقم البطاقة الوطنية` في «عقد عمل» هو ديال الأجير،
  لذلك ما كيتملاش تلقائياً إلا في الوثائق اللي `self_fields` ديالها كتقول ذلك.
- `agent_field_hints`: سؤال مكتوب باليد لحقل معيّن (اختياري).

## 2. الإعداد والنشر

```bash
# 1) أسرار البوت والنماذج
cp supabase/functions/.env.example supabase/functions/.env   # املأ القيم
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase secrets set --env-file supabase/functions/.env

# 2) النشر (--use-api ضروري: الدالة كتستورد js/utils من خارج supabase/functions)
npx supabase functions deploy --use-api

# 3) ربط تيليغرام (مرة واحدة)
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

التحقق من JWT معطّل لهاد الدالة في [`supabase/config.toml`](../supabase/config.toml) (`verify_jwt = false`) لأن تيليغرام ما كيرسلش JWT ديال Supabase؛ الحماية هي `TELEGRAM_WEBHOOK_SECRET`.

**PDF**: شغّل حاوية Gotenberg (`docker run -p 3000:3000 gotenberg/gotenberg:8`) على Cloud Run أو Fly.io أو VPS،
وحط رابطها في `PDF_SERVICE_URL`. بدونها، البوت كيرسل ملف `.html` قابل للطباعة.

**تغيير النموذج**: المزودون كيحيدو النماذج القديمة (مثلاً `gemini-2.5-flash` ما بقاش متاح للمفاتيح الجديدة).
إلا بان فالـ Logs خطأ `HTTP 404 ... model not found`، بدّل غير السر، بلا ما تعاود النشر:

```bash
npx supabase secrets set LLM_MODEL=gemini-3.8-flash
```

باش ما يتوقفش البوت فهاد الحالة، زيد نموذج احتياطي (`LLM_FALLBACK_*`): خطأ 404 كيدوز تلقائياً للنموذج الاحتياطي.

## 3. الاختبارات والتقييم

```bash
# اختبارات (بدون شبكة ولا قاعدة بيانات)
npx deno test --config tests/deno.json --allow-env tests supabase/functions

# تقييم نموذج على eval/cases.json (يستعمل نفس متغيرات LLM_*)
npx deno run --allow-net --allow-env --allow-read --env-file=supabase/functions/.env eval/run.ts
```

قبل تغيير النموذج في الإنتاج، شغّل التقييم وقارن النتائج.

## 4. الخصوصية (القانون 09-08)

- **المستويات المجانية** (مثلاً Google AI Studio المجاني) قد تستعمل الطلبات لتحسين منتجاتها:
  استعملها **للتطوير ببيانات وهمية فقط**. في الإنتاج: مستوى مدفوع بدون تدريب على البيانات، أو نموذج مفتوح
  مستضاف عندك (Ollama / vLLM) باش ما تخرجش البيانات الشخصية من البنية ديالك.
- يجب التصريح لدى **CNDP** بمعالجة البيانات (رقم البطاقة، العنوان، الصوت)، وذكر المزودين في رسالة الموافقة
  (`messages.ts`).
- البوت ما كيحتفظش بالصور ولا بالتسجيلات الصوتية: كتتحول لنص وكتتنسى.

## 5. SonarQube

الإعداد في [`sonar-project.properties`](../sonar-project.properties). على SonarQube محلي:

```bash
npx deno test --config tests/deno.json --allow-env --coverage=coverage/raw tests supabase/functions
npx deno coverage coverage/raw --lcov --output=coverage/lcov.info
npx @sonar/scan -Dsonar.host.url=http://localhost:9000 -Dsonar.token=<TOKEN>
```
or with powershell
```bash
npx deno test --config tests/deno.json --allow-env --coverage=coverage/raw tests supabase/functions
npx deno coverage coverage/raw --lcov --output=coverage/lcov.info
$env:SONAR_TOKEN = "<your token>"
npx @sonar/scan "-Dsonar.host.url=http://localhost:9000"

```

## 6. لوحة مراقبة الوكلاء (للمسؤول)

لوحة التحكم ← **مراقبة الوكلاء الأذكياء** ([`katiboumoumi.online/#/admin/agents`](https://katiboumoumi.online/#/admin/agents)). كتعرض لكل فترة (24 ساعة، 7، 30، 90 يوم)
مقارنة مع الفترة اللي قبلها:

| الجزء | شنو كيبيّن |
| --- | --- |
| الحالة العامة | يعمل / متدهور / متوقف، مع الأسباب (النموذج ما كيجاوبش، webhook فيه خطأ، مفتاح مرفوض، تجاوز الميزانية…) |
| المؤشرات | الرسائل، المستخدمون، الوثائق (الوكيل + الويب)، نسبة النجاح، زمن الرد p50/p95، التوكنات، التكلفة، دقائق عدم التوفر |
| القنوات | تيليغرام (البوت، الـ webhook، الرسائل اللي فالانتظار، آخر خطأ توصيل)، واتساب (غير متصل بعد)، الويب |
| النماذج والمزودون | لكل نموذج: التوفر، الطلبات، الأخطاء (429/503/404/مهلة/مفتاح)، الإعادات، الزمن، التوكنات، التكلفة، **السعة المتبقية** (ترويسات `x-ratelimit-*`)، والفحص المباشر |
| التوكنات والتكلفة | حسب الوقت وحسب المهمة (تحديد الوثيقة، الاستخراج، السؤال، الصياغة، تفريغ الصوت) |
| الرصيد والميزانية | ميزانية شهرية، رصيد مسبق، حصص يومية لكل مزود، والتوقع لآخر الشهر. رصيد OpenRouter كيتقرا مباشرة |
| الإخفاقات وعدم التوفر | الأخطاء حسب النوع، وفترات عدم التوفر (نوافذ 5 دقائق فشلت فيها كل الطلبات) |
| المحادثات | المسار: بدأت ← تحددت الوثيقة ← التأكيد ← سُلّمت، الملغاة والمهجورة، الوثائق الأكثر طلباً |
| الأثمنة والإعداد | أثمنة النماذج (قابلة للتعديل)، والإعداد الحالي بلا مفاتيح |

**التفعيل** (مرة واحدة، بهاد الترتيب):

```bash
# 1) SQL Editor: نفّذ supabase/migrations/003_agent_dashboard.sql  (إضافي فقط، بحال 002)
# 2) انشر الدالتين (telegram-webhook كتسجّل القياسات، agent-status كتعطي الحالة المباشرة)
npx supabase functions deploy telegram-webhook --use-api
npx supabase functions deploy agent-status --use-api
```

- **شنو كيتسجّل**: صف لكل رسالة (`agent_turns`) وصف لكل طلب لخدمة خارجية (`agent_service_calls`):
  الزمن، الحالة HTTP، نوع الخطأ، التوكنات. **ما كيتسجّلش** نص الرسائل ولا المعطيات الشخصية، وتوكن البوت
  والمفاتيح كيتحيدو من رسائل الخطأ. `/forget` كيفصل القياسات على المستخدم. `AGENT_METRICS=off` كيوقف التسجيل.
- **التكلفة تقديرية**: كتتحسب بالأثمنة اللي دخلتي فـ «الأثمنة» (المستويات المجانية = 0). Google وGroq ما عندهمش
  واجهة للرصيد، دخل الميزانية أو الحصة اليومية يدوياً.
- **الأمان**: الجداول بلا سياسات (service role فقط)؛ المتصفح كيقرا غير الأرقام المجمّعة عبر `agent_dashboard()`
  اللي كتتحقق من تسجيل الدخول. `agent-status` كتطلب حتى هي حساب المسؤول.
- **التنظيف** (اختياري، مثلاً كل شهر): `select public.agent_prune_metrics(interval '180 days');`
- **فحص SQL محلي** بلا قاعدة بيانات (Postgres فـ WebAssembly):
  `npx deno run --allow-read --allow-env --allow-net --allow-sys tests/sql/check_migrations.ts`

## الخطوات القادمة

- محوّل واتساب (Meta Cloud API) بنفس واجهة `Channel`.
- زر الميكروفون في تطبيق الويب (نفس `engine.ts` عبر قناة `web`).
- شاشة في لوحة المسؤول لتعديل `agent_document_hints` / `agent_field_hints`.
- تنبيهات (بريد أو تيليغرام للمسؤول) ملي تولّي الحالة «متوقف» أو تقرب الميزانية تسالي.
