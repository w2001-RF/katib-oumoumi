import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, loadingSpinner, attachHeaderBack, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { fetchDocumentType, fetchTemplateFields, incrementUsage, logGeneratedDocument } from '../api.js';
import { validateField, inputTypeFor, fieldOptions } from '../utils/validators.js';
import { addHistoryEntry } from '../history.js';
import { escapeHtml } from '../utils/format.js';

function fieldInputHtml(field) {
  const req = field.is_required ? '<span class="req">*</span>' : '';
  const placeholder = escapeHtml(field.placeholder_ar || '');
  const key = escapeHtml(field.field_key);
  const label = escapeHtml(field.label_ar);
  if (field.field_type === 'text') {
    return `
      <div class="field" data-field="${key}">
        <label>${req}${label}</label>
        <textarea name="${key}" placeholder="${placeholder}"></textarea>
        <div class="error-msg" hidden></div>
      </div>`;
  }
  if (field.field_type === 'select') {
    const options = fieldOptions(field)
      .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
      .join('');
    return `
    <div class="field" data-field="${key}">
      <label>${req}${label}</label>
      <select name="${key}">
        <option value="">${placeholder || '— اختر —'}</option>
        ${options}
      </select>
      <div class="error-msg" hidden></div>
    </div>`;
  }
  const type = inputTypeFor(field.field_type);
  return `
    <div class="field" data-field="${key}">
      <label>${req}${label}</label>
      <input type="${type}" name="${key}" placeholder="${placeholder}" ${
    field.field_type === 'phone' ? 'inputmode="tel"' : ''
  } />
      <div class="error-msg" hidden></div>
    </div>`;
}

export async function renderDocForm(container, params) {
  container.innerHTML = `
    ${renderHeader({ title: '...', showBack: true })}
    <main class="app-main" id="form-main">${loadingSpinner(true)}</main>
    ${renderBottomNav('')}
  `;
  attachHeaderBack(container, '/');

  let docType;
  let fields;
  try {
    [docType, fields] = await Promise.all([fetchDocumentType(params.id), fetchTemplateFields(params.id)]);
  } catch (e) {
    container.querySelector('#form-main').innerHTML =
      `<p class="small-note" style="text-align:center;padding:20px 0;">تعذر تحميل هذه الوثيقة.</p>`;
    return;
  }

  container.querySelector('h1').textContent = docType.name_ar;
  const main = container.querySelector('#form-main');
  main.innerHTML = `
    <form id="doc-form" novalidate>
      ${fields.map(fieldInputHtml).join('')}
      <div class="form-footer">
        <button type="submit" class="btn-primary" id="submit-btn">
          ${icon('fileText')} توليد الوثيقة
        </button>
      </div>
    </form>
  `;

  const form = main.querySelector('#doc-form');
  const submitBtn = main.querySelector('#submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    let hasError = false;

    for (const field of fields) {
      const wrap = form.querySelector(`[data-field="${CSS.escape(field.field_key)}"]`);
      const input = wrap.querySelector('input, textarea, select');
      const value = input.value;
      values[field.field_key] = value;
      const errMsg = validateField(field, value);
      const errEl = wrap.querySelector('.error-msg');
      if (errMsg) {
        hasError = true;
        wrap.classList.add('has-error');
        errEl.textContent = errMsg;
        errEl.hidden = false;
      } else {
        wrap.classList.remove('has-error');
        errEl.hidden = true;
      }
    }

    if (hasError) {
      form.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> جارٍ التوليد...`;

    try {
      await Promise.allSettled([incrementUsage(docType.id), logGeneratedDocument(docType.id, values)]);
      const historyRecord = addHistoryEntry({
        documentTypeId: docType.id,
        documentTypeName: docType.name_ar,
        data: values,
      });
      navigate(`/ready/${historyRecord.id}`);
    } catch (err) {
      showToast('حدث خطأ أثناء توليد الوثيقة');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${icon('fileText')} توليد الوثيقة`;
    }
  });
}
