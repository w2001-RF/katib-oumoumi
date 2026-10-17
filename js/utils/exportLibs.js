// Word/PDF export libraries, loaded only when a document is about to be
// exported (the "document ready" screen), not on every page load.
import { loadScript } from './loadScript.js';

// Exact versions, each pinned by its integrity hash (Subresource Integrity):
// the browser refuses a file whose content changed. To upgrade a library,
// change the URL and its hash together:
//   curl -s <url> | openssl dgst -sha384 -binary | base64
export const EXPORT_LIBS = {
  saveAs: {
    src: 'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js',
    integrity: 'sha384-PlRSzpewlarQuj5alIadXwjNUX+2eNMKwr0f07ShWYLy8B6TjEbm7ZlcN/ScSbwy',
  },
  htmlDocx: {
    src: 'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
    integrity: 'sha384-TtrQp5nveof/QP1+f/OLiEHL3GuOIRyl3IfsGxu5X45VO2vHeT4HRNmQuTR3Ea3w',
  },
  jspdf: {
    src: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    integrity: 'sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/',
  },
};

/**
 * Makes sure the given libraries (keys of EXPORT_LIBS) are on `window`,
 * loading the missing ones in parallel. Rejects with an Arabic message when
 * one cannot be loaded (offline, blocked).
 */
export async function ensureExportLibs(names, { win = globalThis, load = loadScript } = {}) {
  const missing = names.filter((name) => !win[name]);
  try {
    await Promise.all(missing.map((name) => {
      const { src, integrity } = EXPORT_LIBS[name];
      return load(src, globalThis.document, { integrity });
    }));
  } catch {
    throw new Error('تعذر تحميل مكتبة التصدير، تحقق من الاتصال بالإنترنت');
  }
}
