// Client-side export helpers. The whole app is static (GitHub Pages +
// Supabase only, no document-conversion server), so both formats are
// produced straight from the same filled HTML in the browser:
//   - Word (.docx) via html-docx-js
//   - PDF        via html2pdf.js (renders the visible DOM, so Arabic
//                  shaping/RTL just works — it rasterizes what the
//                  browser already displays correctly)
// Both libraries are loaded as classic <script> tags in index.html and
// expose `htmlDocx`, `html2pdf` and `saveAs` on `window`.

function wrapForExport(bodyHtml, title) {
  return `<!DOCTYPE html>
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; text-align: right; font-size: 14px; color: #111; }
      p { margin: 0 0 12px; line-height: 2; }
    </style>
  </head>
  <body>${bodyHtml}</body>
  </html>`;
}

export function exportAsWord(bodyHtml, filename) {
  if (!window.htmlDocx) throw new Error('مكتبة تصدير Word غير محمّلة');
  const full = wrapForExport(bodyHtml, filename);
  const blob = window.htmlDocx.asBlob(full, { orientation: 'portrait' });
  window.saveAs(blob, `${filename}.docx`);
}

export async function exportAsPdf(bodyHtml, filename) {
  if (!window.html2pdf) throw new Error('مكتبة تصدير PDF غير محمّلة');
  const container = document.createElement('div');
  container.setAttribute('dir', 'rtl');
  container.style.cssText =
    'position:fixed;left:-9999px;top:0;width:700px;padding:32px;background:#fff;font-family:Tajawal,Arial,sans-serif;font-size:14px;color:#111;';
  container.innerHTML = bodyHtml;
  document.body.appendChild(container);
  try {
    await window
      .html2pdf()
      .set({
        margin: 12,
        filename: `${filename}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

export async function shareOrDownload(bodyHtml, filename, format) {
  // Web Share API (level 2, files) works on most mobile browsers; we fall
  // back to a plain download everywhere else.
  if (format === 'word') {
    exportAsWord(bodyHtml, filename);
  } else {
    await exportAsPdf(bodyHtml, filename);
  }
}
