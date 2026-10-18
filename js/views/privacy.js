import { APP_NAME, CONTACT_EMAIL, TELEGRAM_BOT_URL } from '../appInfo.js';
import { attachHeaderBack, renderBottomNav, renderHeader } from '../ui.js';

// Keep this text true to what the app does (js/api.js, js/history.js,
// index.html, docs/ai-agent.md § privacy). Update PRIVACY_UPDATED when it changes.
export const PRIVACY_UPDATED = 'أكتوبر 2026';

const SECTIONS = [
  {
    title: 'مقدمة',
    html: `<p>«${APP_NAME}» خدمة مغربية مستقلة لتحرير الوثائق الإدارية، وليست تابعة لأي إدارة عمومية.
      نحترم خصوصيتكم ونلتزم بحماية معطياتكم وفق القوانين المعمول بها، ولا سيما القانون المغربي رقم 09-08
      المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي. توضح هذه الصفحة ما نجمعه ولماذا.</p>`,
  },
  {
    title: 'المعطيات التي نجمعها',
    html: `<p>لا يتطلب التطبيق إنشاء حساب ولا تسجيل الدخول. عند توليد وثيقة:</p>
      <ul>
        <li>تُرسل المعلومات التي تدخلونها في الاستمارة (مثل الاسم ورقم البطاقة الوطنية والعنوان والهاتف)
          إلى قاعدة بياناتنا، مع نوع الوثيقة وتاريخها ومعرّف عشوائي لجهازكم لا يتضمن هويتكم.</li>
        <li>نستعملها لإحصاء استعمال النماذج وتحسينها، ولا نبيعها ولا نشاركها مع أي طرف لأغراض تجارية.</li>
        <li>ملفات Word وPDF تُنشأ داخل متصفحكم، ولا تُرسل الملفات نفسها إلى خوادمنا.</li>
      </ul>`,
  },
  {
    title: 'المعطيات المحفوظة على جهازكم',
    html: `<p>يحفظ التطبيق في متصفحكم فقط:</p>
      <ul>
        <li>سجل الوثائق التي أنشأتموها، مع المعلومات المدخلة، لتتمكنوا من تحميلها من جديد</li>
        <li>اختيار المظهر (فاتح، داكن أو تلقائي)</li>
        <li>المعرّف العشوائي للجهاز المذكور أعلاه</li>
      </ul>
      <p>يمكنكم حذف أي وثيقة من «سجل الوثائق»، أو حذف كل شيء بمسح بيانات هذا الموقع من إعدادات المتصفح.</p>`,
  },
  {
    title: 'الإعلانات',
    html: `<p>يعرض التطبيق إعلانات Google (AdSense) لتغطية تكاليفه وإبقائه مجانياً. قد تستعمل Google ملفات تعريف
      الارتباط (cookies) ومعرّفات الجهاز لعرض الإعلانات وقياسها، وفق سياستها:
      <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">policies.google.com/technologies/ads</a>.
      يمكنكم ضبط الإعلانات المخصّصة على
      <a href="https://adssettings.google.com" target="_blank" rel="noopener">adssettings.google.com</a>.</p>`,
  },
  {
    title: 'الخدمات التقنية',
    html: `<p>نعتمد على خدمات موثوقة لتشغيل التطبيق: GitHub Pages لاستضافة الموقع، وSupabase لقاعدة البيانات،
      وشبكتي jsDelivr وesm.sh لتحميل بعض المكتبات البرمجية عند الحاجة. مثل أي موقع، تطّلع هذه الخدمات تقنياً
      على عنوان IP الخاص بكم أثناء الاتصال.</p>`,
  },
  {
    title: 'بوت تيليغرام',
    html: `<p>عند استعمال <a href="${TELEGRAM_BOT_URL}" target="_blank" rel="noopener">بوت كاتب عمومي على تيليغرام</a>:</p>
      <ul>
        <li>لا يبدأ البوت إلا بعد موافقتكم الصريحة.</li>
        <li>تُرسل رسائلكم إلى خدمات ذكاء اصطناعي خارجية لفهمها وتحرير الوثيقة.</li>
        <li>الرسائل الصوتية والصور لا تُحفظ: تُحوّل إلى نص ثم تُحذف.</li>
        <li>تُحذف المحادثات تلقائياً بعد 30 يوماً.</li>
        <li>الأمر <bdi dir="ltr">/mydata</bdi> يعرض ما هو محفوظ عنكم، والأمر <bdi dir="ltr">/forget</bdi> يحذفه كله.</li>
      </ul>`,
  },
  {
    title: 'حقوقكم',
    html: `<p>وفق القانون 09-08، يحق لكم:</p>
      <ul>
        <li>الاطلاع على معطياتكم وطلب تصحيحها أو حذفها</li>
        <li>الاعتراض على معالجتها لأسباب مشروعة</li>
        <li>تقديم شكاية إلى اللجنة الوطنية لمراقبة حماية المعطيات ذات الطابع الشخصي
          (<a href="https://www.cndp.ma" target="_blank" rel="noopener">CNDP</a>)</li>
      </ul>
      <p>لممارسة هذه الحقوق، راسلونا على العنوان أسفله مع ذكر نوع الوثيقة وتاريخ إنشائها لتسهيل العثور عليها.</p>`,
  },
  {
    title: 'أمان المعطيات',
    html: `<p>تمر كل الاتصالات عبر بروتوكول HTTPS المشفّر. المعطيات المخزّنة في قاعدة بياناتنا محمية بقواعد صلاحيات
      لا تسمح بالاطلاع عليها إلا لمسؤول التطبيق. أما المعطيات المحفوظة على جهازكم، فأمانها مرتبط بحماية جهازكم:
      ننصح بتفعيل قفل الشاشة.</p>`,
  },
  {
    title: 'تواصلوا معنا',
    html: `<p>لأي استفسار بخصوص هذه السياسة أو ممارساتنا المتعلقة بالخصوصية، يُرجى التواصل معنا على:</p>
      <p><a class="policy-mail" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>`,
  },
];

export function renderPrivacy(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'سياسة الخصوصية', showBack: true })}
    <main class="app-main narrow-page">
      <article class="policy">
        <h2 class="policy-title">سياسة الخصوصية — ${APP_NAME}</h2>
        <p class="policy-updated">آخر تحديث: ${PRIVACY_UPDATED}</p>
        ${SECTIONS.map((s, i) => `<section><h3>${i + 1}. ${s.title}</h3>${s.html}</section>`).join('')}
        <p class="policy-footer">تطبيق ${APP_NAME} — جميع الحقوق محفوظة © ${new Date().getFullYear()}</p>
      </article>
    </main>
    ${renderBottomNav('/settings')}
  `;
  attachHeaderBack(container, '/settings');
}
