import { icon } from '../utils/icons.js';
import { renderHeader, loadingSpinner, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { requireAdmin } from './adminGuard.js';
import { adminFetchAllDocumentTypes, adminStats, adminDeleteDocumentType, adminSignOut } from '../api.js';

async function dashboardView(container) {
  container.innerHTML = `
    ${renderHeader({
      title: 'لوحة التحكم',
      showBack: true,
      rightSlot: `<button class="icon-btn" id="logout-btn" aria-label="خروج">${icon('logOut')}</button>`,
    })}
    <main class="app-main">
      <span class="admin-badge">وضع المسؤول</span>
      <div id="stats-slot">${loadingSpinner(true)}</div>

      <div style="display:flex;gap:8px;margin-bottom:18px;">
        <button class="btn-primary" id="new-doc-btn" style="flex:1;">${icon('plus')} وثيقة جديدة</button>
        <button class="btn-outline" id="manage-cats-btn" style="flex:1;margin-top:0;">${icon('grid3')} التصنيفات</button>
      </div>

      <div class="section-title">أنواع الوثائق</div>
      <div id="doctypes-list">${loadingSpinner(true)}</div>
    </main>
  `;

  container.querySelector('[data-action="back"]')?.addEventListener('click', () => navigate('/settings'));
  container.querySelector('#logout-btn').addEventListener('click', async () => {
    await adminSignOut();
    navigate('/settings');
  });
  container.querySelector('#new-doc-btn').addEventListener('click', () => navigate('/admin/doctype/new'));
  container.querySelector('#manage-cats-btn').addEventListener('click', () => navigate('/admin/categories'));

  loadStats();
  loadDocTypes();

  async function loadStats() {
    try {
      const stats = await adminStats();
      container.querySelector('#stats-slot').innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="num">${stats.totalDocs}</div><div class="lbl">أنواع الوثائق</div></div>
          <div class="stat-card"><div class="num">${stats.totalGenerated}</div><div class="lbl">وثيقة تم توليدها</div></div>
          <div class="stat-card"><div class="num">${stats.totalCategories}</div><div class="lbl">التصنيفات</div></div>
        </div>`;
    } catch {
      container.querySelector('#stats-slot').innerHTML = `<p class="small-note">تعذر تحميل الإحصائيات.</p>`;
    }
  }

  async function loadDocTypes() {
    const listEl = container.querySelector('#doctypes-list');
    try {
      const docs = await adminFetchAllDocumentTypes();
      if (!docs.length) {
        listEl.innerHTML = `<div class="empty-state"><p>لا توجد وثائق بعد. أنشئ أول وثيقة.</p></div>`;
        return;
      }
      listEl.innerHTML = docs
        .map(
          (d) => `
        <div class="list-card" data-id="${d.id}">
          <div class="icon-box">${icon(d.icon || 'document')}</div>
          <div class="body">
            <p class="title">${d.name_ar}${d.is_published ? '' : ' <span style="color:var(--danger);font-size:0.75rem;">(غير منشورة)</span>'}</p>
            <div class="meta">
              <span>${d.categories?.name_ar || ''}</span>
              <span>· ${d.usage_count} استخدام</span>
            </div>
          </div>
          <button class="icon-remove" data-del="${d.id}" aria-label="حذف">${icon('trash')}</button>
        </div>`
        )
        .join('');
      listEl.querySelectorAll('.list-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-del]')) return;
          navigate(`/admin/doctype/${card.dataset.id}/edit`);
        });
      });
      listEl.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('حذف هذا النوع من الوثائق نهائياً؟')) return;
          try {
            await adminDeleteDocumentType(btn.dataset.del);
            showToast('تم الحذف');
            loadDocTypes();
            loadStats();
          } catch {
            showToast('تعذر الحذف');
          }
        });
      });
    } catch {
      listEl.innerHTML = `<p class="small-note">تعذر تحميل قائمة الوثائق.</p>`;
    }
  }
}

export const renderAdminDashboard = requireAdmin(dashboardView);
