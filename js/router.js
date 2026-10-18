const routes = [];
let currentCleanup = null;
let mountEl = null;
let onNavigate = null;
let renderSeq = 0;

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
      return seg.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
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
  globalThis.addEventListener('hashchange', renderCurrentRoute);
}

export function navigate(path) {
  if (globalThis.location.hash === `#${path}`) {
    renderCurrentRoute().catch((e) => console.error(e));
  } else {
    globalThis.location.hash = path;
  }
}

export function currentPath() {
  const { hash } = globalThis.location;
  return (hash.startsWith('#') ? hash.slice(1) : hash) || '/';
}

export async function renderCurrentRoute() {
  const path = currentPath();
  const seq = ++renderSeq;
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
  const result = await match.handler(viewElement(), match.params);
  if (typeof result !== 'function') return;
  // A view that finished after the user moved on is cleaned up at once (timers, listeners).
  if (seq === renderSeq) currentCleanup = result;
  else result();
}

// Each render draws into its own element: a view still loading when the user
// moves on (slow network, quick back button) then fills a detached element
// instead of overwriting the next page. `display: contents` keeps the layout
// of #app (flex column, sticky header and bottom bar) unchanged.
function viewElement() {
  if (typeof mountEl.replaceChildren !== 'function') return mountEl; // unit tests: no DOM
  const view = mountEl.ownerDocument.createElement('div');
  view.className = 'route-view';
  view.style.display = 'contents';
  mountEl.replaceChildren(view);
  return view;
}
