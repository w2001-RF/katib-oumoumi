// Loads third-party classic scripts on demand, so the first page load only
// fetches what it needs (ads: js/utils/ads.js; Word/PDF export:
// js/utils/exportLibs.js).

const loading = new Map();

/**
 * Adds a <script> once; resolves when loaded, rejects on error (blocked,
 * offline, or content not matching `integrity`, a 'sha384-…' hash).
 */
export function loadScript(src, doc = globalThis.document, { integrity } = {}) {
  if (!loading.has(src)) {
    loading.set(src, new Promise((resolve, reject) => {
      const el = doc.createElement('script');
      el.src = src;
      el.async = true;
      if (integrity) {
        el.integrity = integrity;
        el.crossOrigin = 'anonymous'; // SRI on another origin needs a CORS request
      }
      el.onload = () => resolve();
      el.onerror = () => {
        loading.delete(src); // let a later attempt try again
        reject(new Error(`could not load ${src}`));
      };
      doc.head.appendChild(el);
    }));
  }
  return loading.get(src);
}

/** For tests. */
export function resetScriptCache() {
  loading.clear();
}
