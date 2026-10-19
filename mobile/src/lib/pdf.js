// A filled document as a PDF: the same HTML as the web app (core
// documentHtml + renderTemplate), laid out by the system's web view, so
// Arabic shaping and right-to-left order come out right.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import { documentHtml } from './core';

// A4 at 72 points per inch; 15 mm margins like the web export.
const A4 = { width: 595, height: 842 };
const PAGE_CSS = '@page { size: A4; margin: 15mm; } body { margin: 0; }';

// Tajawal, the face of the web export, embedded in the page: the system web
// view that lays out the PDF has no access to the app's fonts.
const TAJAWAL = [
  [400, require('@expo-google-fonts/tajawal/400Regular/Tajawal_400Regular.ttf')],
  [700, require('@expo-google-fonts/tajawal/700Bold/Tajawal_700Bold.ttf')],
];
let fontCss = null;

async function embeddedFontCss() {
  if (fontCss === null) {
    try {
      const faces = await Promise.all(TAJAWAL.map(async ([weight, module]) => {
        const [asset] = await Asset.loadAsync(module);
        const base64 = await new File(asset.localUri).base64();
        return `@font-face { font-family: 'Tajawal'; font-weight: ${weight}; src: url(data:font/ttf;base64,${base64}) format('truetype'); }`;
      }));
      fontCss = faces.join(' ');
    } catch {
      fontCss = ''; // falls back to the system's Arabic font
    }
  }
  return fontCss;
}

const fullHtml = async (bodyHtml, title) =>
  documentHtml(bodyHtml, title, { extraCss: `${await embeddedFontCss()} ${PAGE_CSS}` });

// File names keep Arabic letters and digits; spaces become "_".
export function pdfFileName(title) {
  const base = String(title || 'وثيقة').trim().replaceAll(/[\\/:*?"<>|]+/g, '').replaceAll(/\s+/g, '_');
  return `${base || 'وثيقة'}.pdf`;
}

/** Builds the PDF in the cache directory, named after the document. Returns its uri. */
export async function buildPdf(bodyHtml, title) {
  const { uri } = await Print.printToFileAsync({ html: await fullHtml(bodyHtml, title), ...A4 });
  const named = new File(Paths.cache, pdfFileName(title));
  await new File(uri).move(named, { overwrite: true });
  return named.uri;
}

/** Opens the share sheet (WhatsApp, Gmail, Files…) with the PDF. */
export async function sharePdf(uri, title) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متاحة على هذا الجهاز');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
}

/** The system print dialog (also "Save as PDF" on iOS). */
export async function printDocument(bodyHtml, title) {
  await Print.printAsync({ html: await fullHtml(bodyHtml, title), ...A4 });
}
