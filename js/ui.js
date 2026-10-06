import { icon } from './utils/icons.js';
import { navigate, currentPath } from './router.js';

const NAV_ITEMS = [
  { path: '/', label: 'الرئيسية', iconName: 'home' },
  { path: '/categories', label: 'التصنيفات', iconName: 'grid' },
  { path: '/history', label: 'السجل', iconName: 'history' },
  { path: '/settings', label: 'الإعدادات', iconName: 'settings' },
];

export function renderBottomNav(activePath) {
  const items = NAV_ITEMS.map((item) => {
    const isActive = activePath === item.path;
    return `<a href="#${item.path}" class="${isActive ? 'active' : ''}" data-nav="${item.path}">
      <span class="nav-icon-wrap">${icon(item.iconName)}</span>
      <span>${item.label}</span>
    </a>`;
  }).join('');
  // Visual order in the markup is reversed (row-reverse in CSS) so أن
  // "الرئيسية" lands on the right — the natural "home" position in RTL.
  return `<nav class="bottom-nav">${items}</nav>`;
}

export function isTabPath(path) {
  return NAV_ITEMS.some((i) => i.path === path);
}

export function renderHeader({ title, showBack = false, showSearch = false, rightSlot = '' }) {
  const left = showBack
    ? `<button class="icon-btn" data-action="back" aria-label="رجوع">${icon('arrowRight')}</button>`
    : showSearch
    ? `<button class="icon-btn" data-action="search" aria-label="بحث">${icon('search')}</button>`
    : '<span class="spacer"></span>';
  const right = rightSlot || '<span class="spacer"></span>';
  return `<header class="app-header">
    ${left}
    <h1>${title}</h1>
    ${right}
  </header>`;
}

export function attachHeaderBack(container, fallbackPath = '/') {
  const btn = container.querySelector('[data-action="back"]');
  if (btn) {
    btn.addEventListener('click', () => {
      if (window.history.length > 1) window.history.back();
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
