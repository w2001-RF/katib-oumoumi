import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, loadingSpinner } from '../ui.js';
import { navigate } from '../router.js';
import { fetchMostRequested, searchDocumentTypes } from '../api.js';

export async function renderHome(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'كاتب عمومي', showSearch: true })}
    <main class="app-main" id="home-main">
      <div class="search-bar" id="search-bar" style="display:none;">
        <input type="text" id="search-input" placeholder="ابحث عن وثيقة..." />
      </div>
      <div class="hero-banner">
        <h2>كاتب عمومي</h2>
        <p>وثائقك الإدارية في دقيقة واحدة</p>
        <button class="btn-gold" id="browse-btn">${icon('grid3')} تصفح التصنيفات</button>
      </div>
      <div class="section-title">الأكثر طلباً</div>
      <div id="most-requested-list">${loadingSpinner(true)}</div>
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
        listEl.innerHTML = `<p class="small-note">تعذر البحث حالياً.</p>`;
      }
    }, 300);
  });

  function renderList(docs, emptyMessage) {
    if (!docs.length) {
      listEl.innerHTML = `<p class="small-note" style="text-align:center;padding:20px 0;">${emptyMessage}</p>`;
      return;
    }
    listEl.innerHTML = docs
      .map(
        (d) => `
      <div class="list-card" data-doc-id="${d.id}">
        <div class="icon-box">${icon(d.icon || 'document')}</div>
        <div class="body">
          <p class="title">${d.name_ar}</p>
          <div class="meta">
            <span>${d.usage_count} استخدام</span>
            <span class="tag">${icon('fileText')} توليد فوري</span>
          </div>
        </div>
        <span class="chevron">${icon('chevronLeft')}</span>
      </div>`
      )
      .join('');
    listEl.querySelectorAll('[data-doc-id]').forEach((card) => {
      card.addEventListener('click', () => navigate(`/doc/${card.dataset.docId}`));
    });
  }

  async function loadMostRequested() {
    listEl.innerHTML = loadingSpinner(true);
    try {
      const docs = await fetchMostRequested(5);
      renderList(docs, 'لا توجد وثائق بعد');
    } catch (e) {
      listEl.innerHTML = `<p class="small-note" style="text-align:center;padding:20px 0;">تعذر تحميل الوثائق. تحقق من إعداد Supabase.</p>`;
    }
  }

  loadMostRequested();
}
