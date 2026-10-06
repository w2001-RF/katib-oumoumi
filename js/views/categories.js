import { icon, CATEGORY_ICON_COLORS } from '../utils/icons.js';
import { renderHeader, renderBottomNav, loadingSpinner, attachHeaderBack } from '../ui.js';
import { navigate } from '../router.js';
import { fetchCategories, fetchCategoryCounts } from '../api.js';

export async function renderCategories(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'التصنيفات', showBack: true })}
    <main class="app-main">
      <div id="categories-grid">${loadingSpinner(true)}</div>
    </main>
    ${renderBottomNav('/categories')}
  `;
  attachHeaderBack(container, '/');

  try {
    const [categories, counts] = await Promise.all([fetchCategories(), fetchCategoryCounts()]);
    const grid = container.querySelector('#categories-grid');
    if (!categories.length) {
      grid.innerHTML = `<div class="empty-state"><p>لا توجد تصنيفات بعد.</p></div>`;
      return;
    }
    grid.innerHTML = `<div class="category-grid">${categories
      .map((c, i) => {
        const colors = CATEGORY_ICON_COLORS[i % CATEGORY_ICON_COLORS.length];
        return `
        <div class="category-tile" data-cat-id="${c.id}">
          <div class="icon-box" style="background:${colors.bg};color:${colors.fg};">${icon(c.icon)}</div>
          <p class="name">${c.name_ar}</p>
          <p class="count">${counts[c.id] || 0} وثيقة</p>
        </div>`;
      })
      .join('')}</div>`;
    grid.querySelectorAll('[data-cat-id]').forEach((tile) => {
      tile.addEventListener('click', () => navigate(`/categories/${tile.dataset.catId}`));
    });
  } catch (e) {
    container.querySelector('#categories-grid').innerHTML =
      `<p class="small-note" style="text-align:center;padding:20px 0;">تعذر تحميل التصنيفات.</p>`;
  }
}
