import { icon } from './utils/icons.js';
import { navigate } from './router.js';

const NAV_ITEMS = [
  { path: '/', label: 'الرئيسية', iconName: 'home' },
  { path: '/categories', label: 'التصنيفات', iconName: 'grid' },
  { path: '/history', label: 'السجل', iconName: 'history' },
  { path: '/settings', label: 'الإعدادات', iconName: 'settings' },
];

// The red seal: the brand mark (header on mobile, sidebar on desktop).
export const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#b22234"/><g fill="none" stroke="#f6f1e2"><circle cx="20" cy="20" r="14" stroke-width=".9"/><rect x="12" y="12" width="16" height="16" stroke-width="1.1"/><rect x="12" y="12" width="16" height="16" stroke-width="1.1" transform="rotate(45 20 20)"/></g><circle cx="20" cy="20" r="3.4" fill="#f6f1e2"/></svg>`;

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
export function renderHeader({ title, showBack = false, showSearch = false, rightSlot = '', titleTag = 'h1', brand = false }) {
  let left = '<span class="spacer"></span>';
  if (showBack) left = `<button class="icon-btn" data-action="back" aria-label="رجوع">${icon('arrowRight')}</button>`;
  else if (showSearch) left = `<button class="icon-btn" data-action="search" aria-label="بحث">${icon('search')}</button>`;
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
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function loadingSpinner(dark = false) {
  return `<div class="page-loading"><div class="spinner${dark ? ' dark' : ''}"></div></div>`;
}
