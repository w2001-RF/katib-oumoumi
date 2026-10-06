import { icon } from '../utils/icons.js';
import { renderHeader, attachHeaderBack, loadingSpinner, showToast } from '../ui.js';
import { requireAdmin } from './adminGuard.js';
import {
  fetchCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from '../api.js';

const ICON_CHOICES = [
  'folder', 'alert', 'userCheck', 'fileText', 'globe', 'briefcase',
  'list', 'checkCircle', 'users', 'send', 'document', 'star',
];

function iconOptionsHtml(selected) {
  return ICON_CHOICES.map((i) => `<option value="${i}" ${i === selected ? 'selected' : ''}>${i}</option>`).join('');
}

async function categoriesView(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'إدارة التصنيفات', showBack: true })}
    <main class="app-main">
      <div class="admin-card">
        <h3>إضافة تصنيف جديد</h3>
        <form id="new-cat-form">
          <div class="field">
            <label>اسم التصنيف</label>
            <input type="text" name="name_ar" required />
          </div>
          <div class="field">
            <label>الأيقونة</label>
            <select name="icon">${iconOptionsHtml('folder')}</select>
          </div>
          <button type="submit" class="btn-primary">${icon('plus')} إضافة</button>
        </form>
      </div>
      <div class="section-title">التصنيفات الحالية</div>
      <div id="cat-list">${loadingSpinner(true)}</div>
    </main>
  `;
  attachHeaderBack(container, '/admin');

  const listEl = container.querySelector('#cat-list');

  container.querySelector('#new-cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name_ar = form.name_ar.value.trim();
    if (!name_ar) return;
    try {
      await adminCreateCategory({ name_ar, icon: form.icon.value, sort_order: 999 });
      form.reset();
      showToast('تمت الإضافة');
      loadList();
    } catch {
      showToast('تعذرت الإضافة');
    }
  });

  async function loadList() {
    try {
      const categories = await fetchCategories();
      if (!categories.length) {
        listEl.innerHTML = `<div class="empty-state"><p>لا توجد تصنيفات بعد.</p></div>`;
        return;
      }
      listEl.innerHTML = categories
        .map(
          (c) => `
        <div class="admin-card" data-id="${c.id}">
          <div class="admin-fieldrow" style="grid-template-columns:1fr 1fr auto;">
            <div class="field">
              <label>الاسم</label>
              <input type="text" class="f-name" value="${c.name_ar.replace(/"/g, '&quot;')}" />
            </div>
            <div class="field">
              <label>الأيقونة</label>
              <select class="f-icon">${iconOptionsHtml(c.icon)}</select>
            </div>
            <button class="icon-remove" data-del aria-label="حذف">${icon('trash')}</button>
          </div>
          <button class="btn-light" data-save style="width:100%;">حفظ التعديلات</button>
        </div>`
        )
        .join('');

      listEl.querySelectorAll('.admin-card').forEach((card) => {
        const id = card.dataset.id;
        card.querySelector('[data-save]').addEventListener('click', async () => {
          const name_ar = card.querySelector('.f-name').value.trim();
          const iconVal = card.querySelector('.f-icon').value;
          if (!name_ar) return;
          try {
            await adminUpdateCategory(id, { name_ar, icon: iconVal });
            showToast('تم الحفظ');
          } catch {
            showToast('تعذر الحفظ');
          }
        });
        card.querySelector('[data-del]').addEventListener('click', async () => {
          if (!confirm('حذف هذا التصنيف؟ سيتم حذف كل الوثائق المرتبطة به.')) return;
          try {
            await adminDeleteCategory(id);
            showToast('تم الحذف');
            loadList();
          } catch {
            showToast('تعذر الحذف');
          }
        });
      });
    } catch {
      listEl.innerHTML = `<p class="small-note">تعذر تحميل التصنيفات.</p>`;
    }
  }

  loadList();
}

export const renderAdminCategories = requireAdmin(categoriesView);
