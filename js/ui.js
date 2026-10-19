import { icon } from './utils/icons.js';
import { navigate } from './router.js';

const NAV_ITEMS = [
  { path: '/', label: 'الرئيسية', iconName: 'home' },
  { path: '/categories', label: 'التصنيفات', iconName: 'grid' },
  { path: '/history', label: 'السجل', iconName: 'history' },
  { path: '/settings', label: 'الإعدادات', iconName: 'settings' },
];

// The brand mark, same drawing as favicon.svg: a written sheet and a pen
// inside the red seal. Header on mobile, sidebar on desktop, "about" dialog.
export const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#b22234"/><circle cx="32" cy="32" r="26.5" fill="none" stroke="#f6f1e2" stroke-width="1.4"/><path d="M22.4 16H36l8 8v21.6a2.4 2.4 0 0 1-2.4 2.4H22.4a2.4 2.4 0 0 1-2.4-2.4V18.4a2.4 2.4 0 0 1 2.4-2.4z" fill="#f6f1e2"/><path d="M36 16v8h8z" fill="#d4b46a"/><path d="M24.8 28.8h14.4M24.8 33.6h14.4M24.8 38.4h8.8" stroke="#b22234" stroke-width="2.4" stroke-linecap="round"/><path d="M46.4 30.4l4 4-11.2 11.2-4.8.8.8-4.8z" fill="#d4b46a" stroke="#b22234" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

// On desktop (css/styles.css) this nav is a sidebar: the brand and the
// light/dark toggle (js/theme.js) only show there.
export function renderBottomNav(activePath) {
  const items = NAV_ITEMS.map((item) => {
    const isActive = activePath === item.path;
    return `<a href="#${item.path}" class="${isActive ? 'active' : ''}" data-nav="${item.path}">
      <span class="nav-icon-wrap">${icon(item.iconName)}</span>
      <span>${item.label}</span>
    </a>`;
  }).join('');
  // RTL: the first item ("الرئيسية") lands on the right, the natural
  // "home" position; on desktop it is the top of the sidebar.
  return `<nav class="bottom-nav" aria-label="القائمة الرئيسية">
    <div class="nav-brand">${BRAND_MARK}<span><b>كاتب عمومي</b><small>وثائقك الإدارية في دقيقة واحدة</small></span></div>
    ${items}
    <button type="button" class="nav-theme" data-action="toggle-theme">
      <span class="theme-ic">${icon('moon')}</span><span class="theme-ic sun">${icon('sun')}</span>
      <span>الوضع الفاتح / الداكن</span>
    </button>
  </nav>`;
}

export function isTabPath(path) {
  return NAV_ITEMS.some((i) => i.path === path);
}

// `titleTag`: 'h1' by default; the home page passes 'p' because its hero
// carries the page's single H1. `brand`: show the seal before the title.
export function renderHeader({ title, showBack = false, rightSlot = '', titleTag = 'h1', brand = false }) {
  let left = '<span class="spacer"></span>';
  if (showBack) left = `<button class="icon-btn" data-action="back" aria-label="رجوع">${icon('arrowRight')}</button>`;
  const right = rightSlot || '<span class="spacer"></span>';
  return `<header class="app-header">
    ${left}
    <${titleTag} class="app-title">${brand ? `<span class="brand">${BRAND_MARK}<span>${title}</span></span>` : title}</${titleTag}>
    ${right}
  </header>`;
}

export function attachHeaderBack(container, fallbackPath = '/') {
  const btn = container.querySelector('[data-action="back"]');
  if (btn) {
    btn.addEventListener('click', () => {
      if (globalThis.history.length > 1) globalThis.history.back();
      else navigate(fallbackPath);
    });
  }
}

let toastTimer = null;
export function showToast(message) {
  let el = document.getElementById('ko-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ko-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status'); // read out by screen readers, without moving focus
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/**
 * A small modal card (native <dialog>: Esc, focus and backdrop come for free).
 * `media`, `body` and `footer` are trusted HTML; `title` and `subtitle` are text.
 * Removed from the page once closed. Returns the dialog.
 */
export function openInfoDialog({ media = '', title, subtitle = '', body = '', footer = '', okLabel = 'حسناً' }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'info-dialog';
  dialog.setAttribute('aria-labelledby', 'info-dialog-title');
  // The card fills the dialog: a click on the dialog element itself is a click on the backdrop.
  dialog.innerHTML = `<div class="info-dialog-card">
    ${media ? `<div class="info-dialog-media">${media}</div>` : ''}
    <h2 id="info-dialog-title"></h2>
    ${subtitle ? '<p class="info-dialog-subtitle"></p>' : ''}
    <div class="info-dialog-body">${body}</div>
    ${footer ? `<div class="info-dialog-footer">${footer}</div>` : ''}
    <form method="dialog"><button class="info-dialog-ok" value="ok" autofocus>${okLabel}</button></form>
  </div>`;
  dialog.querySelector('h2').textContent = title;
  if (subtitle) dialog.querySelector('.info-dialog-subtitle').textContent = subtitle;
  // A click on the backdrop (outside the card) closes it, like on phones.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
  return dialog;
}

export function loadingSpinner(dark = false) {
  return `<div class="page-loading"><div class="spinner${dark ? ' dark' : ''}"></div></div>`;
}
