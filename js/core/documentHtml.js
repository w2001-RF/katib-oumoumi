import { escapeHtml } from './format.js';

// The standalone HTML of a filled document, as exported: Word on the web
// (html-docx-js), PDF and printing on mobile (expo-print). `extraCss` adds
// platform rules, e.g. @font-face or @page margins.
export function documentHtml(bodyHtml, title, { extraCss = '' } = {}) {
  return `<!DOCTYPE html>
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; text-align: right; font-size: 14px; color: #111; }
      p { margin: 0 0 12px; line-height: 2; }
      ${extraCss}
    </style>
  </head>
  <body>${bodyHtml}</body>
  </html>`;
}
