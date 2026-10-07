import { icon } from './icons.js';
import { showToast } from '../ui.js';
import { generatePdfBlob, exportAsPdf, sharePdf } from './docGenerator.js';

// Returns a function that builds the PDF of `getHtml()` once and then keeps
// returning the same promise of { html, blob } (blob is null when the
// browser cannot build a PDF file).
export function documentLoader(getHtml) {
  let promise = null;
  return () => {
    if (!promise) {
      promise = (async () => {
        const html = await getHtml();
        const blob = await generatePdfBlob(html).catch(() => null);
        return { html, blob };
      })();
      promise.catch(() => {
        promise = null; // let a later tap try again (e.g. network back)
      });
    }
    return promise;
  };
}

// Wires a «مشاركة» button to share the document as a PDF file through the
// system share sheet. Browsers only allow sharing shortly after a tap, so
// when building the PDF took too long the button asks for a second tap,
// which then shares the already-built file instantly. Browsers that cannot
// share files get the PDF downloaded instead.
export function bindShareButton(button, { load, filename, title }) {
  const idleHtml = button.innerHTML;
  let busy = false;

  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.innerHTML = `<span class="spinner dark"></span> جارٍ تجهيز الملف...`;
    let nextHtml = idleHtml;
    try {
      const { html, blob } = await load();
      const result = await sharePdf(blob, filename, title);
      if (result === 'retry') {
        nextHtml = `${icon('share2')} اضغط للمشاركة`;
        showToast('الملف جاهز، اضغط مرة أخرى للمشاركة');
      } else if (result === 'unsupported') {
        const mode = await exportAsPdf(html, filename, blob);
        showToast(
          mode === 'print'
            ? 'اختر "حفظ بصيغة PDF" من نافذة الطباعة ثم شارك الملف'
            : 'المشاركة غير مدعومة على هذا المتصفح، تم تحميل الملف لمشاركته'
        );
      }
    } catch {
      showToast('تعذر مشاركة الوثيقة');
    } finally {
      button.innerHTML = nextHtml;
      button.disabled = false;
      busy = false;
    }
  });
}
