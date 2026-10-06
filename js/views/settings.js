import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, showToast } from '../ui.js';
import { navigate } from '../router.js';

const APP_VERSION = 'v1.0.0';
const CONTACT_EMAIL = 'contact@katibomoumi.com';

export async function renderSettings(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'الإعدادات' })}
    <main class="app-main">
      <div class="settings-group-title">التطبيق</div>
      <div class="settings-row" id="about-row">
        <div class="icon-box">${icon('info')}</div>
        <div class="body">
          <p class="title">عن التطبيق</p>
          <p class="desc">كاتب عمومي — ${APP_VERSION}</p>
        </div>
      </div>
      <div class="settings-row" id="privacy-row">
        <div class="icon-box">${icon('shield')}</div>
        <div class="body"><p class="title">سياسة الخصوصية</p></div>
      </div>

      <div class="settings-group-title">دعمنا</div>
      <div class="settings-row" id="rate-row">
        <div class="icon-box">${icon('star')}</div>
        <div class="body">
          <p class="title">قيّم التطبيق</p>
          <p class="desc">ساعدنا بتقييمك على المتجر</p>
        </div>
      </div>
      <div class="settings-row" id="share-row">
        <div class="icon-box">${icon('share2')}</div>
        <div class="body">
          <p class="title">شارك التطبيق</p>
          <p class="desc">أخبر أصدقاءك عن كاتب عمومي</p>
        </div>
      </div>

      <div class="settings-group-title">تواصل معنا</div>
      <div class="settings-row" id="contact-row">
        <div class="icon-box">${icon('mail')}</div>
        <div class="body">
          <p class="title">راسلنا</p>
          <p class="desc">${CONTACT_EMAIL}</p>
        </div>
      </div>

      <p class="settings-footer">كاتب عمومي ${APP_VERSION}</p>
      <p class="settings-footer" style="margin-top:-18px;">
        <a href="#/admin/login" style="color:var(--text-faint);">دخول المسؤول</a>
      </p>
    </main>
    ${renderBottomNav('/settings')}
  `;

  container.querySelector('#about-row').addEventListener('click', () => {
    showToast(`كاتب عمومي — ${APP_VERSION}\nتطبيق لتوليد الوثائق الإدارية المغربية`);
  });
  container.querySelector('#privacy-row').addEventListener('click', () => {
    showToast('لا يقوم التطبيق بجمع أي بيانات شخصية دون علمك.');
  });
  container.querySelector('#rate-row').addEventListener('click', () => {
    showToast('شكراً لدعمك! (رابط المتجر غير مهيأ بعد)');
  });
  container.querySelector('#share-row').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'كاتب عمومي', text: 'وثائقك الإدارية في دقيقة واحدة', url: window.location.origin });
      } catch {
        /* cancelled */
      }
    } else {
      showToast('انسخ الرابط لمشاركته: ' + window.location.origin);
    }
  });
  container.querySelector('#contact-row').addEventListener('click', () => {
    window.location.href = `mailto:${CONTACT_EMAIL}`;
  });
}
