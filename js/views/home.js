import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, loadingSpinner } from '../ui.js';
import { navigate } from '../router.js';
import { fetchMostRequested, searchDocumentTypes } from '../api.js';

const SITE_URL = 'https://katiboumoumi.online/';
const TELEGRAM_BOT_URL = 'https://t.me/KatibOumoumiBot';
const SHARE_TEXT = 'كاتب عمومي — وثائقك الإدارية في دقيقة واحدة';

// What the service is and how it works: useful to first-time visitors and to
// search engines (the home page is the only page they index).
const ABOUT_HTML = `
  <section class="seo-content" aria-labelledby="how-title">
    <h2 id="how-title">كيف يعمل كاتب عمومي؟</h2>
    <ol>
      <li><strong>اختر الوثيقة:</strong> تصفّح <a href="#/categories">تصنيفات الوثائق</a> أو ابحث عن الوثيقة التي تحتاجها، من الشكاية الإدارية إلى عقد الكراء أو التوكيل.</li>
      <li><strong>املأ المعلومات:</strong> أدخل بياناتك في استمارة بسيطة باللغة العربية، مثل الاسم الكامل ورقم البطاقة الوطنية والعنوان والجهة الموجّهة إليها الوثيقة.</li>
      <li><strong>حمّل وثيقتك:</strong> يصوغ التطبيق الوثيقة وفق الصيغ الإدارية المعتمدة في المغرب، فتحمّلها بصيغة Word أو PDF أو تشاركها مباشرة عبر واتساب أو البريد الإلكتروني.</li>
    </ol>

    <h2>وثائق إدارية مغربية جاهزة</h2>
    <p>يضم كاتب عمومي نماذج لأكثر الوثائق طلباً لدى المواطنين: الشكايات الموجّهة إلى السلطات المحلية أو النيابة العامة، والتوكيلات العامة والخاصة، وعقود الكراء والعمل، والشهادات والإقرارات بالشرف، والطلبات الرسمية الموجّهة إلى الإدارات العمومية والجماعات الترابية.</p>
    <p>كل نموذج مكتوب بلغة إدارية سليمة، ويتضمن العناصر التي تنتظرها الإدارة: المكان والتاريخ، والجهة المرسل إليها، والموضوع، وصيغ الافتتاح والختام، ومكان التوقيع. لم تعد بحاجة إلى التنقل وانتظار دورك لتحرير طلب بسيط: أعدّ وثيقتك من هاتفك أو حاسوبك في أي وقت، ثم اطبعها ووقّعها وأودعها لدى المصلحة المعنية.</p>

    <h2>كاتب عمومي على تيليغرام</h2>
    <p>لا تحب ملء الاستمارات؟ تحدّث مع <a href="${TELEGRAM_BOT_URL}" target="_blank" rel="noopener">بوت كاتب عمومي على تيليغرام (@KatibOumoumiBot)</a>: صِف حاجتك بالكتابة أو برسالة صوتية، أو أرسل صورة بطاقتك الوطنية أو الرسالة التي توصّلت بها، وسيطرح عليك البوت الأسئلة الناقصة ثم يرسل لك الوثيقة بصيغة PDF. خدمة مفيدة بالخصوص لمن يجد صعوبة في القراءة أو الكتابة.</p>

    <h2>لماذا تستعمل كاتب عمومي؟</h2>
    <ul>
      <li><strong>مجاني وسريع:</strong> وثيقتك جاهزة في أقل من دقيقة، دون تسجيل أو اشتراك.</li>
      <li><strong>بالعربية وبصيغ مغربية:</strong> نماذج مكيّفة مع المساطر والإدارات المغربية.</li>
      <li><strong>صيغ قابلة للتعديل:</strong> ملف Word يمكنك تعديله قبل الطباعة، وملف PDF جاهز للإرسال.</li>
      <li><strong>سجل لوثائقك:</strong> تجد الوثائق التي حرّرتها في <a href="#/history">سجل الوثائق</a> على جهازك لتحميلها من جديد.</li>
    </ul>

    <h2>روابط رسمية مفيدة</h2>
    <ul>
      <li><a href="https://www.idarati.ma" target="_blank" rel="noopener">idarati.ma</a>: بوابة المساطر والإجراءات الإدارية.</li>
      <li><a href="https://www.chikaya.ma" target="_blank" rel="noopener">chikaya.ma</a>: البوابة الوطنية للشكايات.</li>
      <li><a href="https://www.watiqa.ma" target="_blank" rel="noopener">watiqa.ma</a>: طلب نسخ عقود الحالة المدنية عبر الإنترنت.</li>
    </ul>
    <p class="small-note">كاتب عمومي خدمة مستقلة لتحرير الوثائق، وليست تابعة لأي إدارة عمومية. تحقّق دائماً من الوثائق المطلوبة لدى المصلحة المعنية.</p>
  </section>`;

function siteFooter() {
  const url = encodeURIComponent(SITE_URL);
  const text = encodeURIComponent(`${SHARE_TEXT} ${SITE_URL}`);
  return `
  <footer class="site-footer">
    <nav aria-label="روابط الموقع">
      <a href="#/categories">تصنيفات الوثائق</a>
      <a href="#/history">سجل الوثائق</a>
      <a href="#/settings">الإعدادات</a>
      <a href="${TELEGRAM_BOT_URL}" target="_blank" rel="noopener">بوت تيليغرام</a>
    </nav>
    <nav aria-label="شارك كاتب عمومي">
      <span>شارك التطبيق:</span>
      <a href="https://wa.me/?text=${text}" target="_blank" rel="noopener">واتساب</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener">فيسبوك</a>
      <a href="https://x.com/intent/post?text=${text}" target="_blank" rel="noopener">X</a>
    </nav>
  </footer>`;
}

export async function renderHome(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'كاتب عمومي', showSearch: true, titleTag: 'p', brand: true })}
    <main class="app-main" id="home-main">
      <div class="search-bar" id="search-bar" style="display:none;">
        <input type="text" id="search-input" placeholder="ابحث عن وثيقة..." aria-label="ابحث عن وثيقة" />
      </div>
      <div class="hero-banner">
        <h1>كاتب عمومي — وثائقك الإدارية في دقيقة واحدة</h1>
        <p>حرّر شكاياتك وتوكيلاتك وعقودك وطلباتك الرسمية بالعربية، وحمّلها بصيغة Word أو PDF جاهزة للطباعة.</p>
        <button class="btn-gold" id="browse-btn">${icon('grid3')} تصفح التصنيفات</button>
      </div>
      <h2 class="section-title">الأكثر طلباً</h2>
      <div id="most-requested-list" class="card-list">${loadingSpinner(true)}</div>
      ${ABOUT_HTML}
      ${siteFooter()}
    </main>
    ${renderBottomNav('/')}
  `;

  const searchBtn = container.querySelector('[data-action="search"]');
  const searchBar = container.querySelector('#search-bar');
  const searchInput = container.querySelector('#search-input');
  const listEl = container.querySelector('#most-requested-list');

  searchBtn.addEventListener('click', () => {
    const willShow = searchBar.style.display === 'none';
    searchBar.style.display = willShow ? 'flex' : 'none';
    if (willShow) searchInput.focus();
  });

  container.querySelector('#browse-btn').addEventListener('click', () => navigate('/categories'));

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    searchTimer = setTimeout(async () => {
      if (!q) {
        loadMostRequested();
        return;
      }
      listEl.innerHTML = loadingSpinner(true);
      try {
        const results = await searchDocumentTypes(q);
        renderList(results, 'لا توجد نتائج مطابقة');
      } catch (e) {
        console.error(e);
        listEl.innerHTML = `<p class="small-note">تعذر البحث حالياً.</p>`;
      }
    }, 300);
  });

  // Real links (not click handlers), so crawlers and "open in new tab" see them.
  function renderList(docs, emptyMessage) {
    if (!docs.length) {
      listEl.innerHTML = `<p class="small-note" style="text-align:center;padding:20px 0;">${emptyMessage}</p>`;
      return;
    }
    listEl.innerHTML = docs
      .map(
        (d) => `
      <a class="list-card" href="#/doc/${d.id}">
        <div class="icon-box">${icon(d.icon || 'document')}</div>
        <div class="body">
          <p class="title">${d.name_ar}</p>
          <div class="meta">
            <span>${d.usage_count} استخدام</span>
            <span class="tag">${icon('fileText')} توليد فوري</span>
          </div>
        </div>
        <span class="chevron">${icon('chevronLeft')}</span>
      </a>`
      )
      .join('');
  }

  async function loadMostRequested() {
    listEl.innerHTML = loadingSpinner(true);
    try {
      const docs = await fetchMostRequested(5);
      renderList(docs, 'لا توجد وثائق بعد');
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<p class="small-note" style="text-align:center;padding:20px 0;">تعذر تحميل الوثائق. تحقق من إعداد Supabase.</p>`;
    }
  }

  loadMostRequested();
}
