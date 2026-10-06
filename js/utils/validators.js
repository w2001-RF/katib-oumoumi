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
];

export function fieldTypeLabel(value) {
  const f = FIELD_TYPES.find((t) => t.value === value);
  return f ? f.label : value;
}

// Moroccan mobile/landline: 0[5-7]XXXXXXXX, or +212 / 00212 prefix.
const PHONE_RE = /^(?:\+212|00212|0)[5-7]\d{8}$/;
// Moroccan national ID (CIN): 1-2 letters followed by 1-8 digits, e.g. G754103.
const CIN_RE = /^[A-Za-z]{1,2}\d{1,8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateField(field, rawValue) {
  const value = (rawValue ?? '').toString().trim();

  if (field.is_required && !value) {
    return 'هذا الحقل إلزامي';
  }
  if (!value) return null; // optional & empty — OK

  switch (field.field_type) {
    case 'int':
      if (!/^-?\d+$/.test(value)) return 'يرجى إدخال رقم صحيح';
      return null;
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'يرجى اختيار تاريخ صحيح';
      return null;
    case 'phone':
      if (!PHONE_RE.test(value.replace(/[\s-]/g, ''))) return 'رقم الهاتف غير صحيح (مثال: 06XXXXXXXX)';
      return null;
    case 'email':
      if (!EMAIL_RE.test(value)) return 'البريد الإلكتروني غير صحيح';
      return null;
    case 'cin':
      if (!CIN_RE.test(value)) return 'رقم البطاقة الوطنية غير صحيح (مثال: G754103)';
      return null;
    default:
      return null;
  }
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
