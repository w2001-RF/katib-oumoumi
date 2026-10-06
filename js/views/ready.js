import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, attachHeaderBack, showToast } from '../ui.js';
import { getHistoryEntry } from '../history.js';
import { fetchDocumentType, fetchTemplateFields } from '../api.js';
import { renderTemplate } from '../utils/templateEngine.js';
import { exportAsWord, exportAsPdf } from '../utils/docGenerator.js';

const AD_SECONDS = 4;

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
    container.querySelector('#actions-slot').innerHTML = `<p class="small-note">تعذر تحميل قالب الوثيقة.</p>`;
    return;
  }

  const filledHtml = renderTemplate(docType.template_body, fields, entry.data);
  const filename = `${docType.name_ar}`.replace(/\s+/g, '_');
  const actionsSlot = container.querySelector('#actions-slot');

  function renderGate() {
    actionsSlot.innerHTML = `
      <button class="btn-gold" id="watch-ad-btn" style="width:100%;justify-content:center;">
        ${icon('play')} شاهد إعلاناً قصيراً لتحميل الوثيقة
      </button>
      <p class="ad-note">إعلان قصير · مجاني تماماً · بدون اشتراك</p>
    `;
    container.querySelector('#watch-ad-btn').addEventListener('click', runAdSimulation);
  }

  function runAdSimulation() {
    let remaining = AD_SECONDS;
    actionsSlot.innerHTML = `
      <button class="btn-gold" style="width:100%;justify-content:center;" disabled>
        <span class="spinner"></span> جارٍ عرض الإعلان... (<span id="ad-count">${remaining}</span>)
      </button>
      <p class="ad-note">سيتم تحميل الوثيقة بعد انتهاء الإعلان</p>
    `;
    const counterEl = actionsSlot.querySelector('#ad-count');
    const timer = setInterval(() => {
      remaining -= 1;
      if (counterEl) counterEl.textContent = String(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        renderUnlocked();
      }
    }, 1000);
  }

  function renderUnlocked() {
    actionsSlot.innerHTML = `
      <button class="btn-primary" id="download-word">${icon('download')} تحميل Word</button>
      <button class="btn-outline" id="download-pdf">${icon('download')} تحميل PDF</button>
      <button class="btn-outline" id="share-btn">${icon('share2')} مشاركة</button>
      <button class="link-btn" id="toggle-preview" style="display:block;margin:16px auto 0;">معاينة الوثيقة</button>
      <div id="preview-box" hidden></div>
    `;

    actionsSlot.querySelector('#download-word').addEventListener('click', () => {
      try {
        exportAsWord(filledHtml, filename);
        showToast('تم تحميل الوثيقة بصيغة Word');
      } catch (e) {
        showToast('تعذر تحميل الوثيقة');
      }
    });

    actionsSlot.querySelector('#download-pdf').addEventListener('click', async () => {
      try {
        await exportAsPdf(filledHtml, filename);
        showToast('تم تحميل الوثيقة بصيغة PDF');
      } catch (e) {
        showToast('تعذر تحميل الوثيقة');
      }
    });

    actionsSlot.querySelector('#share-btn').addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: docType.name_ar, text: 'وثيقة من تطبيق كاتب عمومي' });
        } catch {
          /* user cancelled */
        }
      } else {
        showToast('المشاركة غير مدعومة على هذا المتصفح');
      }
    });

    const previewBox = actionsSlot.querySelector('#preview-box');
    actionsSlot.querySelector('#toggle-preview').addEventListener('click', () => {
      previewBox.hidden = !previewBox.hidden;
      if (!previewBox.hidden) previewBox.innerHTML = `<div class="doc-preview">${filledHtml}</div>`;
    });
  }

  renderGate();
}
