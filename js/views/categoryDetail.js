import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, loadingSpinner, attachHeaderBack } from '../ui.js';
import { navigate } from '../router.js';
import { fetchCategory, fetchDocumentTypesByCategory } from '../api.js';

export async function renderCategoryDetail(container, params) {
  container.innerHTML = `
    ${renderHeader({ title: '...', showBack: true })}
    <main class="app-main">
      <div id="doctype-list">${loadingSpinner(true)}</div>
    </main>
    ${renderBottomNav('/categories')}
  `;
  attachHeaderBack(container, '/categories');

  try {
    const [category, docTypes] = await Promise.all([
      fetchCategory(params.id),
      fetchDocumentTypesByCategory(params.id),
    ]);
    container.querySelector('h1').textContent = category.name_ar;
    const listEl = container.querySelector('#doctype-list');
    if (!docTypes.length) {
      listEl.innerHTML = `<div class="empty-state"><p>لا توجد وثائق في هذا التصنيف بعد.</p></div>`;
      return;
    }
    listEl.innerHTML = docTypes
      .map(
        (d) => `
      <div class="list-card" data-doc-id="${d.id}">
        <div class="icon-box">${icon(d.icon || 'document')}</div>
        <div class="body">
          <p class="title">${d.name_ar}</p>
          <div class="meta"><span>${d.description_ar || ''}</span></div>
        </div>
        <span class="chevron">${icon('chevronLeft')}</span>
      </div>`
      )
      .join('');
    listEl.querySelectorAll('[data-doc-id]').forEach((card) => {
      card.addEventListener('click', () => navigate(`/doc/${card.dataset.docId}`));
    });
  } catch (e) {
    container.querySelector('#doctype-list').innerHTML =
      `<p class="small-note" style="text-align:center;padding:20px 0;">تعذر تحميل هذا التصنيف.</p>`;
  }
}
