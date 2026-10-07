import { icon } from '../utils/icons.js';
import { renderHeader, attachHeaderBack, loadingSpinner, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { requireAdmin } from './adminGuard.js';
import { FIELD_TYPES } from '../utils/validators.js';
import { renderTemplate, sampleValuesFor } from '../utils/templateEngine.js';
import { enhanceSelects } from '../utils/searchableSelect.js';
import { uid, escapeHtml } from '../utils/format.js';
import {
  fetchCategories,
  adminFetchDocumentType,
  fetchTemplateFields,
  adminCreateDocumentType,
  adminUpdateDocumentType,
  adminReplaceFields,
  fetchOptionLists,
  NEW_OPTION_LIST,
} from '../api.js';

const ICON_CHOICES = [
  'document', 'alert', 'userCheck', 'fileText', 'globe', 'briefcase',
  'list', 'checkCircle', 'users', 'send', 'folder',
];

function fieldTypeOptionsHtml(selected) {
  return FIELD_TYPES.map((t) => `<option value="${t.value}" ${t.value === selected ? 'selected' : ''}>${t.label}</option>`).join('');
}

function fieldRowHtml(field, optionLists) {
  const listId = field.option_list_id || NEW_OPTION_LIST;
  return `
  <div class="admin-fieldrow" data-row-id="${field.rowId}">
    <div class="field">
      <label>مفتاح الحقل (placeholder)</label>
      <input type="text" class="f-key" value="${(field.field_key || '').replace(/"/g, '&quot;')}" placeholder="مثال: اسم الموكل" />
    </div>
    <div class="field">
      <label>التسمية الظاهرة للمستخدم</label>
      <input type="text" class="f-label" value="${(field.label_ar || '').replace(/"/g, '&quot;')}" placeholder="اسم الموكل" />
    </div>
    <button type="button" class="icon-remove" data-remove-row aria-label="حذف الحقل">${icon('trash')}</button>
    <div class="field" style="grid-column:1/2;">
      <label>نوع الحقل</label>
      <select class="f-type">${fieldTypeOptionsHtml(field.field_type || 'varchar')}</select>
    </div>
    <div class="field" style="grid-column:2/3;">
      <label>نص توضيحي (اختياري)</label>
      <input type="text" class="f-placeholder" value="${(field.placeholder_ar || '').replace(/"/g, '&quot;')}" />
    </div>
    <div class="field f-options-wrap" style="grid-column:1/4;" ${field.field_type === 'select' ? '' : 'hidden'}>
      <label>قائمة الاختيارات</label>
      <select class="f-list">
        ${optionLists.map((l) => `<option value="${l.id}" ${l.id === listId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
        <option value="${NEW_OPTION_LIST}" ${listId === NEW_OPTION_LIST ? 'selected' : ''}>+ قائمة جديدة</option>
      </select>
      <input type="text" class="f-list-name" placeholder="اسم القائمة الجديدة" value="${escapeHtml(field.list_name || '')}" ${listId === NEW_OPTION_LIST ? '' : 'hidden'} />
      <label style="margin-top:10px;">عناصر القائمة (عنصر في كل سطر — أضف «أخرى» للسماح بكتابة قيمة غير موجودة)</label>
      <textarea class="f-options" rows="4">${escapeHtml((field.options || []).join('\n'))}</textarea>
      <p class="small-note f-list-warning" ${listId === NEW_OPTION_LIST ? 'hidden' : ''}>
        تعديل هذه العناصر يغيّر القائمة في كل الوثائق التي تستعملها.
      </p>
    </div>
    <label class="checkbox-row" style="grid-column:1/4;">
      <input type="checkbox" class="f-required" ${field.is_required !== false ? 'checked' : ''} /> حقل إلزامي
    </label>
  </div>`;
}

async function editorView(container, params) {
  const isNew = params.id === 'new';
  container.innerHTML = `
    ${renderHeader({ title: isNew ? 'وثيقة جديدة' : 'تعديل الوثيقة', showBack: true })}
    <main class="app-main">${loadingSpinner(true)}</main>
  `;
  attachHeaderBack(container, '/admin');

  let categories = [];
  let docType = null;
  let fields = [];
  let optionLists = [];
  // set once the document exists, so a retry after a failed save updates it instead of creating another
  let savedDocId = isNew ? null : params.id;

  try {
    [categories, optionLists] = await Promise.all([fetchCategories(), fetchOptionLists()]);
    if (!isNew) {
      [docType, fields] = await Promise.all([
        adminFetchDocumentType(params.id),
        fetchTemplateFields(params.id),
      ]);
    }
  } catch (e) {
    container.querySelector('main').innerHTML = `<p class="small-note">تعذر تحميل البيانات.</p>`;
    return;
  }

  // Give each field a stable client-side row id for DOM tracking (not persisted).
  let workingFields = fields.map((f) => ({ ...f, rowId: uid() }));

  const main = container.querySelector('main');
  main.innerHTML = `
    <div class="admin-card">
      <h3>معلومات الوثيقة</h3>
      <form id="meta-form">
        <div class="field">
          <label>اسم نوع الوثيقة</label>
          <input type="text" name="name_ar" required value="${docType ? docType.name_ar.replace(/"/g, '&quot;') : ''}" />
        </div>
        <div class="field">
          <label>وصف مختصر</label>
          <input type="text" name="description_ar" value="${docType ? (docType.description_ar || '').replace(/"/g, '&quot;') : ''}" />
        </div>
        <div class="field">
          <label>التصنيف</label>
          <select name="category_id" required>
            ${categories
              .map(
                (c) =>
                  `<option value="${c.id}" ${docType && docType.category_id === c.id ? 'selected' : ''}>${c.name_ar}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>الأيقونة</label>
          <select name="icon">
            ${ICON_CHOICES.map((i) => `<option value="${i}" ${docType && docType.icon === i ? 'selected' : ''}>${i}</option>`).join('')}
          </select>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" name="is_published" ${!docType || docType.is_published ? 'checked' : ''} /> منشورة للمستخدمين
        </label>
      </form>
    </div>

    <div class="admin-card">
      <h3>حقول القالب (Placeholders)</h3>
      <p class="small-note" style="margin-bottom:12px;">
        كل حقل تضيفه هنا يصبح متاحاً داخل نص الوثيقة عبر <code>{{مفتاح الحقل}}</code>.
      </p>
      <div id="fields-list"></div>
      <button type="button" class="btn-light" id="add-field-btn" style="width:100%;">${icon('plus')} إضافة حقل</button>
    </div>

    <div class="admin-card">
      <h3>نص الوثيقة (Template)</h3>
      <p class="small-note" style="margin-bottom:12px;">
        اكتب نص الوثيقة بصيغة HTML بسيطة، واستعمل <code>{{مفتاح الحقل}}</code> في المكان المناسب.
      </p>
      <div class="field">
        <textarea id="template-body" style="min-height:220px;font-family:monospace;font-size:0.82rem;direction:ltr;text-align:left;">${docType ? docType.template_body : ''}</textarea>
      </div>
      <button type="button" class="btn-light" id="preview-btn" style="width:100%;">معاينة</button>
      <div id="preview-slot"></div>
    </div>

    <button type="button" class="btn-primary" id="save-btn">${icon('fileText')} حفظ الوثيقة</button>
  `;

  const fieldsListEl = main.querySelector('#fields-list');
  enhanceSelects(main.querySelector('#meta-form'));

  function paintFields() {
    fieldsListEl.innerHTML = workingFields.map((f) => fieldRowHtml(f, optionLists)).join('') ||
      `<p class="small-note" style="margin-bottom:12px;">لا توجد حقول بعد.</p>`;
    enhanceSelects(fieldsListEl);
    fieldsListEl.querySelectorAll('[data-row-id]').forEach((row) => {
      row.querySelector('.f-type').addEventListener('change', (e) => {
        row.querySelector('.f-options-wrap').hidden = e.target.value !== 'select';
      });
      row.querySelector('.f-list').addEventListener('change', (e) => {
        const isNewList = e.target.value === NEW_OPTION_LIST;
        row.querySelector('.f-list-name').hidden = !isNewList;
        row.querySelector('.f-list-warning').hidden = isNewList;
        if (!isNewList) {
          // show the chosen list's items; for a new list keep what is typed,
          // so an existing list can serve as a starting point
          row.querySelector('.f-options').value = optionLists.find((l) => l.id === e.target.value).items.join('\n');
        }
      });
      row.querySelector('[data-remove-row]').addEventListener('click', () => {
        workingFields = readFieldsFromDom().filter((f) => f.rowId !== row.dataset.rowId);
        paintFields();
      });
    });
  }
  paintFields();

  main.querySelector('#add-field-btn').addEventListener('click', () => {
    workingFields = readFieldsFromDom(); // keep what was typed in the other rows
    workingFields.push({ rowId: uid(), field_key: '', label_ar: '', field_type: 'varchar', is_required: true, placeholder_ar: '' });
    paintFields();
  });

  function readFieldsFromDom() {
    const rows = [...fieldsListEl.querySelectorAll('[data-row-id]')];
    return rows.map((row) => ({
      rowId: row.dataset.rowId,
      field_key: row.querySelector('.f-key').value.trim(),
      label_ar: row.querySelector('.f-label').value.trim(),
      field_type: row.querySelector('.f-type').value,
      placeholder_ar: row.querySelector('.f-placeholder').value.trim(),
      is_required: row.querySelector('.f-required').checked,
      options: row
        .querySelector('.f-options')
        .value.split('\n')
        .map((o) => o.trim())
        .filter(Boolean),
      option_list_id: row.querySelector('.f-type').value === 'select' ? row.querySelector('.f-list').value : null,
      list_name: row.querySelector('.f-list-name').value.trim(),
    }));
  }

  main.querySelector('#preview-btn').addEventListener('click', () => {
    const currentFields = readFieldsFromDom();
    const body = main.querySelector('#template-body').value;
    const values = sampleValuesFor(currentFields.filter((f) => f.field_key));
    const html = renderTemplate(body, currentFields.filter((f) => f.field_key), values);
    main.querySelector('#preview-slot').innerHTML = `<div class="doc-preview" style="margin-top:12px;">${html}</div>`;
  });

  main.querySelector('#save-btn').addEventListener('click', async () => {
    const metaForm = main.querySelector('#meta-form');
    const name_ar = metaForm.name_ar.value.trim();
    const category_id = metaForm.category_id.value;
    if (!name_ar || !category_id) {
      showToast('يرجى إدخال اسم الوثيقة واختيار التصنيف');
      return;
    }
    const currentFields = readFieldsFromDom();
    for (const f of currentFields) {
      if (!f.field_key || !f.label_ar) {
        showToast('يرجى تعبئة مفتاح وتسمية كل حقل');
        return;
      }
      if (f.field_type === 'select' && !f.options.length) {
        showToast(`يرجى إضافة اختيارات للقائمة: ${f.label_ar}`);
        return;
      }
      if (f.option_list_id === NEW_OPTION_LIST) {
        if (!f.list_name) {
          showToast(`يرجى إدخال اسم القائمة الجديدة: ${f.label_ar}`);
          return;
        }
        if (optionLists.some((l) => l.name === f.list_name)) {
          showToast(`اسم القائمة "${f.list_name}" مستعمل، اختر اسماً آخر`);
          return;
        }
      }
    }
    const keys = currentFields.map((f) => f.field_key);
    if (new Set(keys).size !== keys.length) {
      showToast('مفاتيح الحقول يجب أن تكون فريدة');
      return;
    }

    const payload = {
      name_ar,
      description_ar: metaForm.description_ar.value.trim(),
      category_id,
      icon: metaForm.icon.value,
      is_published: metaForm.is_published.checked,
      template_body: main.querySelector('#template-body').value,
    };

    const saveBtn = main.querySelector('#save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner"></span> جارٍ الحفظ...`;

    try {
      let savedDoc;
      if (savedDocId) {
        savedDoc = await adminUpdateDocumentType(savedDocId, payload);
      } else {
        savedDoc = await adminCreateDocumentType({ ...payload, usage_count: 0, sort_order: 999 });
        savedDocId = savedDoc.id;
      }
      await adminReplaceFields(savedDoc.id, currentFields);
      showToast('تم حفظ الوثيقة بنجاح');
      navigate('/admin');
    } catch (e) {
      showToast(e.userMessage || 'تعذر حفظ الوثيقة');
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${icon('fileText')} حفظ الوثيقة`;
    }
  });
}

export const renderAdminDocTypeEditor = requireAdmin(editorView);
