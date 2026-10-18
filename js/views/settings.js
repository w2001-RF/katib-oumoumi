import { icon } from '../utils/icons.js';
import { BRAND_MARK, openInfoDialog, renderHeader, renderBottomNav, showToast } from '../ui.js';
import { applyTheme, readThemePref } from '../theme.js';
import { navigate } from '../router.js';
import { APP_DESCRIPTION, APP_NAME, APP_VERSION, CONTACT_EMAIL, TELEGRAM_BOT_URL } from '../appInfo.js';

const THEME_CHOICES = [
  { value: 'auto', label: 'تلقائي', iconName: 'monitor' },
  { value: 'light', label: 'فاتح', iconName: 'sun' },
  { value: 'dark', label: 'داكن', iconName: 'moon' },
];


export async function renderSettings(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'الإعدادات' })}
    <main class="app-main narrow-page">
      <div class="settings-group-title">المظهر</div>
      <div class="theme-switch" role="radiogroup" aria-label="المظهر">
        ${THEME_CHOICES.map((c) => `<button type="button" role="radio" data-theme-choice="${c.value}" aria-checked="false">${icon(c.iconName)} ${c.label}</button>`).join('')}
      </div>

      <div class="settings-group-title">التطبيق</div>
      <div class="settings-row" id="about-row">
        <div class="icon-box">${icon('info')}</div>
        <div class="body">
          <p class="title">عن التطبيق</p>
          <p class="desc">${APP_NAME} — v${APP_VERSION}</p>
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

      <p class="settings-footer">${APP_NAME} v${APP_VERSION}</p>
      <p class="settings-footer" style="margin-top:-18px;">
        <a href="#/admin/login" style="color:var(--text-faint);">دخول المسؤول</a>
      </p>
    </main>
    ${renderBottomNav('/settings')}
  `;

  const themeButtons = [...container.querySelectorAll('[data-theme-choice]')];
  const markTheme = (pref) => themeButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeChoice === pref)));
  markTheme(readThemePref());
  themeButtons.forEach((b) => b.addEventListener('click', () => {
    applyTheme(b.dataset.themeChoice);
    markTheme(b.dataset.themeChoice);
  }));

  container.querySelector('#about-row').addEventListener('click', showAbout);
  container.querySelector('#privacy-row').addEventListener('click', () => navigate('/privacy'));
  container.querySelector('#rate-row').addEventListener('click', () => {
    showToast('شكراً لدعمك! (رابط المتجر غير مهيأ بعد)');
  });
  container.querySelector('#share-row').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'كاتب عمومي', text: 'وثائقك الإدارية في دقيقة واحدة', url: globalThis.location.origin });
      } catch {
        /* cancelled */
      }
    } else {
      showToast('انسخ الرابط لمشاركته: ' + globalThis.location.origin);
    }
  });
  container.querySelector('#contact-row').addEventListener('click', () => {
    globalThis.location.href = `mailto:${CONTACT_EMAIL}`;
  });
}

// «عن التطبيق»: the app's card.
export function showAbout() {
  return openInfoDialog({
    media: BRAND_MARK,
    title: APP_NAME,
    subtitle: `الإصدار ${APP_VERSION}`,
    body: `<p>${APP_DESCRIPTION}</p>`,
    footer: `<a href="${TELEGRAM_BOT_URL}" target="_blank" rel="noopener">متوفر أيضاً على تيليغرام: <bdi dir="ltr">@KatibOumoumiBot</bdi></a>`,
  });
}
