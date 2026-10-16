// Word/PDF export libraries, loaded only when a document is about to be
// exported (the "document ready" screen), not on every page load.
import { loadScript } from './loadScript.js';

export const EXPORT_LIBS = {
  saveAs: 'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js',
  htmlDocx: 'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
};

/**
 * Makes sure the given libraries (keys of EXPORT_LIBS) are on `window`,
 * loading the missing ones in parallel. Rejects with an Arabic message when
 * one cannot be loaded (offline, blocked).
 */
export async function ensureExportLibs(names, { win = globalThis, load = loadScript } = {}) {
  const missing = names.filter((name) => !win[name]);
  try {
    await Promise.all(missing.map((name) => load(EXPORT_LIBS[name])));
  } catch {
    throw new Error('تعذر تحميل مكتبة التصدير، تحقق من الاتصال بالإنترنت');
  }
}
