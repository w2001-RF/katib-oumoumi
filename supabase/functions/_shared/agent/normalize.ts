// Cleans a value extracted by a model (or typed by the user) before it goes
// through the web app's own validators. Models and users write numbers in
// Arabic-Indic digits, add spaces inside phone numbers, "درهم" after amounts...

import { fieldOptions } from '../../../../js/utils/validators.js';
import type { TemplateField } from './types.ts';

const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

export function latinDigits(s: string): string {
  return s
    .replaceAll(/[٠-٩]/g, (d) => String((d.codePointAt(0) ?? ARABIC_INDIC_ZERO) - ARABIC_INDIC_ZERO))
    .replaceAll(/[۰-۹]/g, (d) => String((d.codePointAt(0) ?? PERSIAN_ZERO) - PERSIAN_ZERO));
}

// Folds Arabic spelling variants so «الدار البيضاء» matches «الدارالبيضاء», «إقليم» matches «اقليم»...
export function foldArabic(s: string): string {
  return s
    .replaceAll(/[ً-ْـ]/g, '') // harakat, tatweel
    .replaceAll(/[إأآ]/g, 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAll(/\s+/g, '')
    .toLowerCase();
}

function asText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

const DMY_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;
const INT_RE = /-?\d+/;

export function normalizeValue(field: TemplateField, raw: unknown): string {
  const v = latinDigits(asText(raw)).trim();
  switch (field.field_type) {
    case 'cin':
      return v.replaceAll(/[\s\-.]/g, '').toUpperCase();
    case 'phone':
      return v.replaceAll(/[\s\-.()]/g, '');
    case 'email':
      return v.replaceAll(/\s/g, '').toLowerCase();
    case 'int': {
      const grouped = v.replaceAll(/[\s,.](?=\d{3}\b)/g, ''); // 3 000 / 3,000 / 3.000
      return INT_RE.exec(grouped)?.[0] ?? grouped;
    }
    case 'date': {
      // Accept D/M/YYYY and D-M-YYYY as well as ISO.
      const dmy = DMY_RE.exec(v);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      return v;
    }
    case 'select': {
      const options = fieldOptions(field) as string[];
      // «أخرى» lets free values through; validateField decides.
      return options.find((o) => foldArabic(o) === foldArabic(v)) ?? v;
    }
    default:
      return v;
  }
}
