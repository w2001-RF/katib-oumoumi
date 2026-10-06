import { registerRoute, initRouter, renderCurrentRoute } from './router.js';
import { renderHome } from './views/home.js';
import { renderCategories } from './views/categories.js';
import { renderCategoryDetail } from './views/categoryDetail.js';
import { renderDocForm } from './views/docForm.js';
import { renderReady } from './views/ready.js';
import { renderHistory } from './views/history.js';
import { renderSettings } from './views/settings.js';
import { renderAdminLogin } from './admin/adminLogin.js';
import { renderAdminDashboard } from './admin/adminDashboard.js';
import { renderAdminCategories } from './admin/adminCategories.js';
import { renderAdminDocTypeEditor } from './admin/adminDocTypeEditor.js';
import { supabaseReady } from './supabaseClient.js';

registerRoute('/', renderHome);
registerRoute('/categories', renderCategories);
registerRoute('/categories/:id', renderCategoryDetail);
registerRoute('/doc/:id', renderDocForm);
registerRoute('/ready/:id', renderReady);
registerRoute('/history', renderHistory);
registerRoute('/settings', renderSettings);

registerRoute('/admin/login', renderAdminLogin);
registerRoute('/admin', renderAdminDashboard);
registerRoute('/admin/categories', renderAdminCategories);
registerRoute('/admin/doctype/new', (container) => renderAdminDocTypeEditor(container, { id: 'new' }));
registerRoute('/admin/doctype/:id/edit', (container, params) => renderAdminDocTypeEditor(container, params));

const app = document.getElementById('app');

if (!supabaseReady) {
  app.innerHTML = `
    <div style="padding:40px 24px;text-align:center;font-family:sans-serif;direction:rtl;">
      <h2 style="color:#16294a;">إعداد Supabase غير مكتمل</h2>
      <p style="color:#555;line-height:1.8;">
        لم يتم العثور على <code>supabase-config.js</code>. إذا كنت تُشغّل المشروع محلياً، انسخ
        <code>supabase-config.example.js</code> إلى <code>supabase-config.js</code> واملأ بيانات مشروعك.
        عند النشر عبر GitHub Actions يتم توليد هذا الملف تلقائياً من أسرار المستودع
        (SUPABASE_URL و SUPABASE_ANON_KEY). راجع README.md لمزيد من التفاصيل.
      </p>
    </div>`;
} else {
  initRouter(app);
  renderCurrentRoute();
}
