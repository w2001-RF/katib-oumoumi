// Client-side export helpers. The whole app is static (GitHub Pages +
// Supabase only, no document-conversion server), so both formats are
// produced straight from the same filled HTML in the browser:
//   - Word (.docx) via html-docx-js
//   - PDF        via jsPDF, fed with an image of the document rendered by
//                  the browser itself (SVG <foreignObject>), so Arabic
//                  shaping and RTL/bidi ordering are exactly what the
//                  browser displays.
// Both libraries are loaded as classic <script> tags in index.html and
// expose `htmlDocx`, `jspdf` and `saveAs` on `window`.

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

// --- PDF ---------------------------------------------------------------------
//
// Why not html2canvas/html2pdf: html2canvas re-implements text layout word
// by word, which scrambles Arabic punctuation and drops spaces, and its
// cloning breaks on RTL pages (blank or shifted output). Instead we:
//   1. lay the document out in an isolated hidden iframe (only our styles,
//      the Tajawal font embedded) and measure its line boxes;
//   2. pick page breaks that fall between lines, never through one;
//   3. render the very same markup + styles through an SVG <foreignObject>,
//      i.e. by the browser's own layout engine, onto a canvas;
//   4. slice that canvas into A4 pages with jsPDF.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_MARGIN_MM = 15;
// 180mm printable width ≈ 680 CSS px at 96dpi, so text keeps its on-screen size.
const CONTENT_WIDTH_PX = 680;
const PX_PER_MM = CONTENT_WIDTH_PX / (A4_WIDTH_MM - 2 * PDF_MARGIN_MM);
const PAGE_CONTENT_HEIGHT_PX = Math.floor((A4_HEIGHT_MM - 2 * PDF_MARGIN_MM) * PX_PER_MM);
const RENDER_SCALE = 2;

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=block';
const DOC_CSS = `.katib-doc { width:${CONTENT_WIDTH_PX}px; background:#fff; color:#111;
  font-family:Tajawal,Arial,sans-serif; font-size:14px; line-height:1.9;
  direction:rtl; text-align:right; }`;

let fontCssPromise = null;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// SVG images cannot load external resources, so the Tajawal @font-face
// rules are inlined with data: URLs. Falls back to system fonts ('') if
// Google Fonts is unreachable.
function getEmbeddedFontCss() {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      try {
        let css = await (await fetch(FONT_CSS_URL)).text();
        const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
        const dataUrls = await Promise.all(urls.map(async (u) => blobToDataUrl(await (await fetch(u)).blob())));
        urls.forEach((u, i) => {
          css = css.split(u).join(dataUrls[i]);
        });
        return css;
      } catch {
        return '';
      }
    })();
  }
  return fontCssPromise;
}

function createHiddenFrame(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = `position:fixed;top:0;left:0;width:${CONTENT_WIDTH_PX + 40}px;height:200px;` +
      'opacity:0;pointer-events:none;border:0;z-index:-1;';
    iframe.onload = () => resolve(iframe);
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

function measureLines(docEl) {
  const top = docEl.getBoundingClientRect().top;
  const lines = [];
  const walker = docEl.ownerDocument.createTreeWalker(docEl, NodeFilter.SHOW_TEXT);
  const range = docEl.ownerDocument.createRange();
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode);
    for (const r of range.getClientRects()) {
      if (r.height > 0) lines.push({ top: r.top - top, bottom: r.bottom - top });
    }
  }
  return lines;
}

// Returns [start, end] pixel ranges, one per page, cut between text lines.
function computePageRanges(lines, totalHeight) {
  const ranges = [];
  let start = 0;
  while (totalHeight - start > PAGE_CONTENT_HEIGHT_PX) {
    const limit = start + PAGE_CONTENT_HEIGHT_PX;
    let cut = start;
    for (const line of lines) {
      const y = Math.ceil(line.bottom);
      if (y > cut && y <= limit && !lines.some((o) => o.top < y && o.bottom > y)) cut = y;
    }
    if (cut <= start) cut = limit; // a single "line" taller than a page
    ranges.push([start, cut]);
    start = cut;
  }
  ranges.push([start, totalHeight]);
  return ranges;
}

async function renderToCanvas(docEl, styleTag, height) {
  const xhtml = new XMLSerializer().serializeToString(docEl);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CONTENT_WIDTH_PX}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${styleTag}${xhtml}</div>` +
    `</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = CONTENT_WIDTH_PX * RENDER_SCALE;
  canvas.height = height * RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function buildPdf(canvas, pageRanges) {
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pageRanges.forEach(([from, to], i) => {
    if (i > 0) pdf.addPage();
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((to - from) * RENDER_SCALE));
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, from * RENDER_SCALE, slice.width, slice.height, 0, 0, slice.width, slice.height);
    // toDataURL throws on browsers that taint foreignObject canvases.
    const data = slice.toDataURL('image/jpeg', 0.95);
    pdf.addImage(data, 'JPEG', PDF_MARGIN_MM, PDF_MARGIN_MM, A4_WIDTH_MM - 2 * PDF_MARGIN_MM, (to - from) / PX_PER_MM);
  });
  return pdf;
}

// Last resort: the browser's own print dialog ("Save as PDF").
function printFallback(frame, title) {
  const doc = frame.contentDocument;
  doc.title = title;
  const style = doc.createElement('style');
  style.textContent = `@page { size: A4; margin: ${PDF_MARGIN_MM}mm; } body { margin: 0; }`;
  doc.head.appendChild(style);
  frame.contentWindow.focus();
  frame.contentWindow.print();
}

// Resolves to 'download' when a .pdf file was saved, or 'print' when the
// browser's print dialog was opened instead.
export async function exportAsPdf(bodyHtml, filename) {
  if (!window.jspdf) throw new Error('مكتبة تصدير PDF غير محمّلة');
  const styleTag = `<style>${await getEmbeddedFontCss()}\n${DOC_CSS}</style>`;
  const frame = await createHiddenFrame(
    `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />${styleTag}</head>` +
      `<body style="margin:0;background:#fff;"><div class="katib-doc" dir="rtl" lang="ar">${bodyHtml}</div></body></html>`,
  );
  let keepFrame = false;
  try {
    const frameDoc = frame.contentDocument;
    if (frameDoc.fonts && frameDoc.fonts.ready) await frameDoc.fonts.ready;
    const docEl = frameDoc.querySelector('.katib-doc');
    const height = Math.ceil(docEl.getBoundingClientRect().height);
    const pageRanges = computePageRanges(measureLines(docEl), height);

    let pdf;
    try {
      pdf = buildPdf(await renderToCanvas(docEl, styleTag, height), pageRanges);
    } catch {
      keepFrame = true;
      printFallback(frame, filename);
      setTimeout(() => frame.remove(), 60000);
      return 'print';
    }
    pdf.save(`${filename}.pdf`);
    return 'download';
  } finally {
    if (!keepFrame) frame.remove();
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
