# كاتب عمومي — تطبيق الهاتف (Expo)

تطبيق Android وiOS مبني بـ React Native و[Expo](https://expo.dev) (SDK 58، JavaScript، Expo Router).
نفس خدمة الموقع: نفس قاعدة Supabase، ونفس النواة [`js/core/`](../js/core) التي يستعملها الموقع وبوت تيليغرام:

| من النواة المشتركة | الاستعمال في التطبيق |
| --- | --- |
| `catalog.js` | التصنيفات، الوثائق، حقول كل وثيقة، تسجيل الوثيقة المولَّدة |
| `validators.js` | نفس قواعد التحقق (البطاقة الوطنية، الهاتف المغربي، البريد، القوائم) |
| `templateEngine.js`، `documentHtml.js` | نفس نص الوثيقة ونفس صفحة HTML المصدَّرة |
| `format.js` | التواريخ بالأشهر المغربية (غشت، دجنبر...) |
| `history.js`، `session.js` | سجل الوثائق ومعرّف الجهاز (localStorage على SQLite) |
| `arabicSearch.js` | البحث في القوائم («اكادير» تجد «أكادير») |
| `iconPaths.js`، `brandMark.js` | نفس الأيقونات ونفس الشعار |

أي تعديل في `js/core/` يصل للموقع وللتطبيق وللبوت معاً.

## التشغيل

```bash
cd mobile
npm install
cp .env.example .env      # ثم املأ رابط Supabase والمفتاح العام (anon) ديال نفس المشروع
npx expo start            # امسح رمز QR بتطبيق Expo Go أو شغّل محاكي Android/iOS
```

- `.env` غير مرفوع إلى Git. المفتاح العام (anon) فقط: لا تضع أبداً مفتاح `service_role`، فقيم `EXPO_PUBLIC_*` تُضمَّن داخل التطبيق.
- في Expo Go يتبع اتجاه الواجهة لغة الهاتف؛ فرض العربية من اليمين لليسار (`forcesRTL`) واسم التطبيق وأيقونته
  تطبَّق في نسخة التطوير أو النشر: `npx expo run:android` محلياً، أو `npx eas-cli@latest build`.

## الفحوصات

```bash
npm run lint              # ESLint (eslint-config-expo)
npm run doctor            # expo-doctor: توافق الحزم والإعدادات
npm run export:android    # يتأكد أن التطبيق كامل (والنواة المشتركة) يُجمَّع بدون أخطاء
```

اختبارات النواة المشتركة توجد مع اختبارات الموقع: `tests/web/core_test.js` (انظر README الرئيسي).

## البنية

```
src/app/                    المسارات (Expo Router)
  _layout.js                الخطوط، شاشة البداية، الترويسة الخضراء
  (tabs)/                   الرئيسية، التصنيفات، السجل، الإعدادات (نفس شريط الموقع)
  category/[id].js          وثائق تصنيف
  doc/[id].js               استمارة الوثيقة (تحقق عند مغادرة الحقل، كما في الموقع)
  ready/[id].js             الوثيقة جاهزة: مشاركة PDF، طباعة، معاينة
src/components/             عناصر الواجهة (بطاقات بإطار ذهبي، أزرار، حقول الاستمارة)
src/lib/
  polyfills.js              localStorage (expo-sqlite) وcrypto (expo-crypto) للنواة المشتركة
  core.js                   نقطة استيراد النواة المشتركة ../../../js/core
  api.js                    عميل Supabase + createCatalog
  pdf.js                    PDF عبر expo-print (خط Tajawal مضمَّن) ثم المشاركة
src/theme.js                ألوان الهوية «مخزن» (فاتح/داكن حسب إعداد الهاتف)
metro.config.js             يسمح لـ Metro بقراءة ../js/core
```

## الفروق مع الموقع

- **اتجاه الكتابة:** التطبيق عربي فقط ومفروض من اليمين لليسار (`expo-localization` → `forcesRTL`).
- **المظهر:** يتبع إعداد الهاتف (فاتح/داكن)، بدون زر داخل التطبيق.
- **التصدير:** PDF فقط في هذه النسخة (مشاركة أو طباعة)؛ Word لم يُنقل بعد.
- **بدون إعلانات** وبدون شاشات المسؤول: الإدارة تبقى على الموقع.
- **سياسة الخصوصية** تُفتح من صفحة الموقع.
