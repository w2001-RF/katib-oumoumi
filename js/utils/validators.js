// Definition of every supported placeholder/field type.
// Used both by the normal-user dynamic form renderer and by the admin
// template-field editor (so the type list only lives in one place).
export const FIELD_TYPES = [
  { value: 'varchar', label: 'نص قصير' },
  { value: 'text', label: 'نص طويل' },
  { value: 'int', label: 'رقم' },
  { value: 'date', label: 'تاريخ' },
  { value: 'phone', label: 'رقم هاتف' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'cin', label: 'رقم البطاقة الوطنية' },
  { value: 'select', label: 'قائمة اختيارات' },
];

export function fieldTypeLabel(value) {
  const f = FIELD_TYPES.find((t) => t.value === value);
  return f ? f.label : value;
}

// Moroccan mobile/landline: 0[5-7]XXXXXXXX, or +212 / 00212 prefix.
const PHONE_RE = /^(?:\+212|00212|0)[5-7]\d{8}$/;
// Moroccan national ID (CIN): 1-2 letters followed by 1-8 digits, e.g. G754103.
const CIN_RE = /^[A-Za-z]{1,2}\d{1,8}$/;
const INT_RE = /^-?\d+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WHITESPACE_RE = /\s/;

// name@domain.tld: one "@", no spaces, a dot inside the domain (not first or
// last). Same rule as /^[^\s@]+@[^\s@]+\.[^\s@]+$/, checked without a
// backtracking regex.
function isEmail(value) {
  if (WHITESPACE_RE.test(value)) return false;
  const parts = value.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1].slice(1, -1).includes('.');
}

export function validateField(field, rawValue) {
  const value = (rawValue ?? '').toString().trim();

  if (field.is_required && !value) {
    return 'هذا الحقل إلزامي';
  }
  if (!value) return null; // optional & empty — OK

  const check = TYPE_CHECKS[field.field_type];
  return check ? check(value, field) : null;
}

// Per field type: the error message for a non-empty value, or null when valid.
const TYPE_CHECKS = {
  int: (value) => (INT_RE.test(value) ? null : 'يرجى إدخال رقم صحيح'),
  date: (value) => (ISO_DATE_RE.test(value) ? null : 'يرجى اختيار تاريخ صحيح'),
  phone: (value) => (PHONE_RE.test(value.replaceAll(/[\s-]/g, '')) ? null : 'رقم الهاتف غير صحيح (مثال: 06XXXXXXXX)'),
  email: (value) => (isEmail(value) ? null : 'البريد الإلكتروني غير صحيح'),
  cin: (value) => (CIN_RE.test(value) ? null : 'رقم البطاقة الوطنية غير صحيح (مثال: G754103)'),
  select: (value, field) => {
    // «أخرى» in the options means any typed value is accepted.
    if (hasOtherOption(field)) return null;
    const options = fieldOptions(field);
    return options.length && !options.includes(value) ? 'يرجى اختيار قيمة من القائمة' : null;
  },
};

// Choices of a 'select' field (jsonb array in the database).
export function fieldOptions(field) {
  return Array.isArray(field.options) ? field.options : [];
}

// Adding this option to a 'select' field lets the user type a value that
// is not in the list (e.g. a small town missing from the city list).
export const OTHER_OPTION = 'أخرى';

export function hasOtherOption(field) {
  return fieldOptions(field).includes(OTHER_OPTION);
}

export function inputTypeFor(fieldType) {
  switch (fieldType) {
    case 'int': return 'number';
    case 'date': return 'date';
    case 'phone': return 'tel';
    case 'email': return 'email';
    default: return 'text';
  }
}
