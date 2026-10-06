import { formatDateAr, textToHtml, escapeHtml } from './format.js';

// Replaces every {{field_key}} occurrence in `templateBody` with the
// matching value from `fieldsById` (field_key -> raw value), formatting
// dates into Moroccan Arabic and escaping everything else for HTML safety.
export function renderTemplate(templateBody, fields, values) {
  let html = templateBody || '';
  for (const field of fields) {
    const raw = values[field.field_key] ?? '';
    let rendered;
    if (field.field_type === 'date') {
      rendered = escapeHtml(formatDateAr(raw));
    } else if (field.field_type === 'text') {
      rendered = textToHtml(raw);
    } else {
      rendered = escapeHtml(raw);
    }
    const token = `{{${field.field_key}}}`;
    html = html.split(token).join(rendered || '.....');
  }
  return html;
}

// Builds a small sample-data object for admin live-preview purposes.
export function sampleValuesFor(fields) {
  const samples = {
    varchar: 'مثال نصي',
    text: 'مثال نص طويل يوضح شكل الفقرة داخل الوثيقة.',
    int: '1200',
    date: new Date().toISOString().slice(0, 10),
    phone: '0612345678',
    email: 'example@mail.com',
    cin: 'A123456',
  };
  const values = {};
  for (const f of fields) {
    values[f.field_key] = (f.field_type === 'select' && f.options && f.options[0]) || samples[f.field_type] || 'قيمة';
  }
  return values;
}
