import { icon } from '../utils/icons.js';
import { BRAND_MARK, openInfoDialog, renderHeader, renderBottomNav, showToast } from '../ui.js';
import { applyTheme, readThemePref } from '../theme.js';
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
      <button type="button" class="settings-row" id="about-row" aria-haspopup="dialog">
        <span class="icon-box">${icon('info')}</span>
        <span class="body">
          <span class="title">عن التطبيق</span>
          <span class="desc">${APP_NAME} — v${APP_VERSION}</span>
        </span>
      </button>
      <a class="settings-row" id="privacy-row" href="#/privacy">
        <span class="icon-box">${icon('shield')}</span>
        <span class="body"><span class="title">سياسة الخصوصية</span></span>
      </a>

      <div class="settings-group-title">دعمنا</div>
      <button type="button" class="settings-row" id="rate-row">
        <span class="icon-box">${icon('star')}</span>
        <span class="body">
          <span class="title">قيّم التطبيق</span>
          <span class="desc">ساعدنا بتقييمك على المتجر</span>
        </span>
      </button>
      <button type="button" class="settings-row" id="share-row">
        <span class="icon-box">${icon('share2')}</span>
        <span class="body">
          <span class="title">شارك التطبيق</span>
          <span class="desc">أخبر أصدقاءك عن كاتب عمومي</span>
        </span>
      </button>

      <div class="settings-group-title">تواصل معنا</div>
      <a class="settings-row" id="contact-row" href="mailto:${CONTACT_EMAIL}">
        <span class="icon-box">${icon('mail')}</span>
        <span class="body">
          <span class="title">راسلنا</span>
          <span class="desc">${CONTACT_EMAIL}</span>
        </span>
      </a>

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
