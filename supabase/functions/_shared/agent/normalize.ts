// Cleans a value extracted by a model (or typed by the user) before it goes
// through the web app's own validators. Models and users write numbers in
// Arabic-Indic digits, add spaces inside phone numbers, "درهم" after amounts...

import { fieldOptions, validateField } from '../../../../js/utils/validators.js';
import { arabicPlaceName, hasLatinLetters } from './places.ts';
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
    case 'select':
      return selectOption(fieldOptions(field) as string[], v);
    default:
      return v;
  }
}

// The listed option the value stands for: same Arabic spelling, or a place
// name typed in Latin letters ("Casablanca" → «الدار البيضاء»). Otherwise the
// value itself (in Arabic when it is a known place); validateForBot decides.
function selectOption(options: string[], v: string): string {
  const same = (a: string) => options.find((o) => foldArabic(o) === foldArabic(a));
  const place = arabicPlaceName(v);
  return same(v) ?? (place ? same(place) ?? place : v);
}

export const LATIN_NOT_ALLOWED = 'عافاك كتب هاد المعلومة بالحروف العربية، ولا اختار من اللائحة.';

/**
 * The web app's validation, plus one rule for the bot: a select value that is
 * not one of the options (allowed by «أخرى») must be written in Arabic.
 * Returns the error message, or null.
 */
export function validateForBot(field: TemplateField, value: string): string | null {
  const error = validateField(field, value);
  if (error || field.field_type !== 'select' || !value) return error;
  const listed = (fieldOptions(field) as string[]).includes(value);
  return !listed && hasLatinLetters(value) ? LATIN_NOT_ALLOWED : null;
}
