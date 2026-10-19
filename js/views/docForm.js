import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, loadingSpinner, attachHeaderBack, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { fetchDocumentType, fetchTemplateFields, incrementUsage, logGeneratedDocument } from '../api.js';
import { validateField, inputTypeFor, fieldOptions, hasOtherOption, OTHER_OPTION } from '../utils/validators.js';
import { addHistoryEntry } from '../history.js';
import { escapeHtml } from '../utils/format.js';
import { enhanceSelects } from '../utils/searchableSelect.js';
import { renderTemplate } from '../utils/templateEngine.js';

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Value of a field's control; for a dropdown set to «أخرى», the typed text.
function readFieldValue(wrap) {
  const select = wrap.querySelector('select');
  if (select?.value === OTHER_OPTION) return wrap.querySelector('.other-input').value;
  return wrap.querySelector('input, textarea, select').value;
}

// `index` builds the ids that tie each label and error message to its control
// (field keys are Arabic and may hold spaces, so they can't be ids).
function fieldInputHtml(field, index) {
  const req = field.is_required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const placeholder = escapeHtml(field.placeholder_ar || '');
  const key = escapeHtml(field.field_key);
  const label = escapeHtml(field.label_ar);
  const id = `f-${index}`;
  const a11y = `id="${id}" aria-describedby="${id}-err"${field.is_required ? ' aria-required="true"' : ''}`;
  const labelHtml = `<label for="${id}">${req}${label}</label>`;
  const errorHtml = `<div class="error-msg" id="${id}-err" hidden></div>`;
  if (field.field_type === 'text') {
    return `
      <div class="field" data-field="${key}">
        ${labelHtml}
        <textarea name="${key}" ${a11y} placeholder="${placeholder}"></textarea>
        ${errorHtml}
      </div>`;
  }
  if (field.field_type === 'select') {
    const options = fieldOptions(field)
      .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
      .join('');
    return `
    <div class="field" data-field="${key}">
      ${labelHtml}
      <select name="${key}" ${a11y}>
        <option value="">${placeholder || '— اختر —'}</option>
        ${options}
      </select>
      ${hasOtherOption(field) ? `<input type="text" class="other-input" placeholder="اكتب القيمة" aria-label="${label}: اكتب القيمة" hidden />` : ''}
      ${errorHtml}
    </div>`;
  }
  const type = inputTypeFor(field.field_type);
  return `
    <div class="field" data-field="${key}">
      ${labelHtml}
      <input type="${type}" name="${key}" ${a11y} placeholder="${placeholder}" ${
    field.field_type === 'phone' ? 'inputmode="tel"' : ''
  } />
      ${errorHtml}
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
    console.error(e);
    container.querySelector('#form-main').innerHTML =
      `<p class="small-note" style="text-align:center;padding:20px 0;">تعذر تحميل هذه الوثيقة.</p>`;
    return;
  }

  container.querySelector('h1').textContent = docType.name_ar;
  const main = container.querySelector('#form-main');
  main.innerHTML = `
    <div class="form-layout">
      <form id="doc-form" novalidate>
        ${fields.map(fieldInputHtml).join('')}
        <div class="form-footer">
          <button type="submit" class="btn-primary" id="submit-btn">
            ${icon('fileText')} توليد الوثيقة
          </button>
        </div>
      </form>
      <aside class="live-preview" aria-label="معاينة الوثيقة">
        <div class="preview-cap">معاينة مباشرة</div>
        <div class="doc-preview" id="live-doc"></div>
      </aside>
    </div>
  `;

  const form = main.querySelector('#doc-form');
  enhanceSelects(form);

  form.querySelectorAll('.other-input').forEach((other) => {
    const select = other.parentElement.querySelector('select');
    select.addEventListener('change', () => {
      other.hidden = select.value !== OTHER_OPTION;
      if (!other.hidden) other.focus();
    });
  });
  const submitBtn = main.querySelector('#submit-btn');

  // Live preview: the letter fills in as the user types.
  const liveDoc = main.querySelector('#live-doc');
  const readValues = () => Object.fromEntries(fields.map((f) => [
    f.field_key,
    readFieldValue(form.querySelector(`[data-field="${CSS.escape(f.field_key)}"]`)),
  ]));
  const paintPreview = () => {
    liveDoc.innerHTML = renderTemplate(docType.template_body, fields, readValues());
  };
  let previewTimer = null;
  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(paintPreview, 120);
  };
  form.addEventListener('input', schedulePreview);
  form.addEventListener('change', schedulePreview);
  paintPreview();

  const wrapOf = (field) => form.querySelector(`[data-field="${CSS.escape(field.field_key)}"]`);

  // Shows or clears the field's error; returns true when the value is valid.
  function checkField(field, wrap = wrapOf(field)) {
    const errMsg = validateField(field, readFieldValue(wrap));
    const errEl = wrap.querySelector('.error-msg');
    // The native select and, when enhanced, the button that stands for it.
    const controls = wrap.querySelectorAll('.combo-trigger, input:not(.other-input):not(.combo-search), textarea, select');
    wrap.classList.toggle('has-error', Boolean(errMsg));
    errEl.textContent = errMsg || '';
    errEl.hidden = !errMsg;
    controls.forEach((c) => (errMsg ? c.setAttribute('aria-invalid', 'true') : c.removeAttribute('aria-invalid')));
    return !errMsg;
  }

  // Check a field as soon as people leave it, not only when they submit:
  // a wrong CIN shows up right away. An untouched empty field stays quiet
  // until the submit, so tabbing through the form doesn't fill it with errors.
  const fieldOfWrap = (wrap) => fields.find((f) => f.field_key === wrap?.dataset.field);
  form.addEventListener('focusout', (e) => {
    const wrap = e.target.closest('[data-field]');
    const field = fieldOfWrap(wrap);
    if (!field || wrap.contains(e.relatedTarget)) return; // still inside the field (dropdown, «أخرى»)
    if (readFieldValue(wrap).trim() === '' && !wrap.classList.contains('has-error')) return;
    checkField(field, wrap);
  });
  // Once a field shows an error, it clears as soon as the value is right.
  const recheck = (e) => {
    const wrap = e.target.closest('[data-field]');
    if (wrap?.classList.contains('has-error')) checkField(fieldOfWrap(wrap), wrap);
  };
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    let hasError = false;

    for (const field of fields) {
      const wrap = wrapOf(field);
      values[field.field_key] = readFieldValue(wrap);
      if (!checkField(field, wrap)) hasError = true;
    }

    if (hasError) {
      const firstError = form.querySelector('.has-error');
      firstError?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      // Focus the field so a screen reader reads its label and error at once.
      firstError?.querySelector('.combo-trigger, input:not([hidden]), textarea')?.focus({ preventScroll: true });
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
      console.error(err);
      showToast('حدث خطأ أثناء توليد الوثيقة');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${icon('fileText')} توليد الوثيقة`;
    }
  });
}
