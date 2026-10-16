import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, attachHeaderBack, showToast } from '../ui.js';
import { getHistoryEntry } from '../history.js';
import { fetchDocumentType, fetchTemplateFields } from '../api.js';
import { renderTemplate } from '../utils/templateEngine.js';
import { exportAsWord, exportAsPdf } from '../utils/docGenerator.js';
import { documentLoader, bindShareButton } from '../utils/shareButton.js';
import { AdResult, adsConfig, adsEnabled, showRewardedAd } from '../utils/ads.js';

export async function renderReady(container, params) {
  container.innerHTML = `
    ${renderHeader({ title: 'الوثيقة جاهزة', showBack: true })}
    <main class="app-main">
      <div class="result-screen" id="result-root">
        <div class="check-circle">${icon('checkCircle')}</div>
        <h2>الوثيقة جاهزة</h2>
        <p class="subtitle" id="doc-name">...</p>
        <div class="actions" id="actions-slot"></div>
      </div>
    </main>
    ${renderBottomNav('')}
  `;
  attachHeaderBack(container, '/');

  const entry = getHistoryEntry(params.id);
  if (!entry) {
    container.querySelector('#actions-slot').innerHTML = `<p class="small-note">تعذر العثور على هذه الوثيقة.</p>`;
    return;
  }
  container.querySelector('#doc-name').textContent = entry.documentTypeName;

  let docType, fields;
  try {
    [docType, fields] = await Promise.all([
      fetchDocumentType(entry.documentTypeId),
      fetchTemplateFields(entry.documentTypeId),
    ]);
  } catch (e) {
    console.error(e);
    container.querySelector('#actions-slot').innerHTML = `<p class="small-note">تعذر تحميل قالب الوثيقة.</p>`;
    return;
  }

  const filledHtml = renderTemplate(docType.template_body, fields, entry.data);
  const filename = `${docType.name_ar}`.replaceAll(/\s+/g, '_');
  const actionsSlot = container.querySelector('#actions-slot');
  const loadDocument = documentLoader(() => filledHtml);

  const ads = adsConfig();

  // Without ads configured the downloads are shown at once.
  function renderGate(note = 'إعلان قصير · مجاني تماماً · بدون اشتراك') {
    if (!adsEnabled(ads)) {
      renderUnlocked();
      return;
    }
    actionsSlot.innerHTML = `
      <button class="btn-gold" id="watch-ad-btn" style="width:100%;justify-content:center;">
        ${icon('play')} شاهد إعلاناً قصيراً لتحميل الوثيقة
      </button>
      <p class="ad-note">${note}</p>
    `;
    container.querySelector('#watch-ad-btn').addEventListener('click', watchAd);
  }

  // Google rewarded ad (js/utils/ads.js): the download unlocks when Google
  // grants the reward, or when no ad can be shown — never blocks the user.
  async function watchAd() {
    actionsSlot.innerHTML = `
      <button class="btn-gold" style="width:100%;justify-content:center;" disabled>
        <span class="spinner"></span> جارٍ تحميل الإعلان...
      </button>
      <p class="ad-note">سيتم تحميل الوثيقة بعد انتهاء الإعلان</p>
    `;
    const result = await showRewardedAd(ads);
    if (!actionsSlot.isConnected) return; // the user left this page meanwhile
    if (result === AdResult.DISMISSED) {
      renderGate('أُغلق الإعلان قبل نهايته: شاهده حتى النهاية لتحميل الوثيقة.');
      return;
    }
    renderUnlocked();
    if (result === AdResult.UNAVAILABLE) showToast('لا يوجد إعلان حالياً، يمكنك تحميل الوثيقة مجاناً');
  }

  function renderUnlocked() {
    actionsSlot.innerHTML = `
      <button class="btn-primary" id="download-word">${icon('download')} تحميل Word</button>
      <button class="btn-outline" id="download-pdf">${icon('download')} تحميل PDF</button>
      <button class="btn-outline" id="share-btn">${icon('share2')} مشاركة</button>
      <button class="link-btn" id="toggle-preview" style="display:block;margin:16px auto 0;">معاينة الوثيقة</button>
      <div id="preview-box" hidden></div>
    `;
    // Build the PDF right away so «تحميل PDF» and «مشاركة» respond instantly
    // (sharing must happen within a few seconds of the tap).
    loadDocument();

    actionsSlot.querySelector('#download-word').addEventListener('click', async () => {
      try {
        await exportAsWord(filledHtml, filename);
        showToast('تم تحميل الوثيقة بصيغة Word');
      } catch (e) {
        console.error(e);
        showToast('تعذر تحميل الوثيقة');
      }
    });

    actionsSlot.querySelector('#download-pdf').addEventListener('click', async () => {
      try {
        const { blob } = await loadDocument();
        const mode = await exportAsPdf(filledHtml, filename, blob);
        showToast(mode === 'print' ? 'اختر "حفظ بصيغة PDF" من نافذة الطباعة' : 'تم تحميل الوثيقة بصيغة PDF');
      } catch (e) {
        console.error(e);
        showToast('تعذر تحميل الوثيقة');
      }
    });

    bindShareButton(actionsSlot.querySelector('#share-btn'), {
      load: loadDocument,
      filename,
      title: docType.name_ar,
    });

    const previewBox = actionsSlot.querySelector('#preview-box');
    actionsSlot.querySelector('#toggle-preview').addEventListener('click', () => {
      previewBox.hidden = !previewBox.hidden;
      if (!previewBox.hidden) previewBox.innerHTML = `<div class="doc-preview">${filledHtml}</div>`;
    });
  }

  renderGate();
}
