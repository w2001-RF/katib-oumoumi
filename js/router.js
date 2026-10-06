const routes = [];
let currentCleanup = null;
let mountEl = null;
let onNavigate = null;

export function registerRoute(pattern, handler) {
  // pattern example: '/doc/:id'
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({ regex: new RegExp(`^${regexStr}$`), paramNames, handler });
}

function matchRoute(path) {
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
  }
  return null;
}

export function initRouter(el, notifyFn) {
  mountEl = el;
  onNavigate = notifyFn;
  window.addEventListener('hashchange', renderCurrentRoute);
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) {
    renderCurrentRoute();
  } else {
    window.location.hash = path;
  }
}

export function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/';
}

export async function renderCurrentRoute() {
  const path = currentPath();
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch { /* noop */ }
    currentCleanup = null;
  }
  mountEl.scrollTop = 0;
  const match = matchRoute(path);
  if (onNavigate) onNavigate(path);
  if (!match) {
    mountEl.innerHTML = `<div class="empty-state"><h3>الصفحة غير موجودة</h3></div>`;
    return;
  }
  const result = await match.handler(mountEl, match.params);
  if (typeof result === 'function') currentCleanup = result;
}
