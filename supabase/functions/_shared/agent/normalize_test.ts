import { assertEquals } from 'jsr:@std/assert@1';
import { foldArabic, latinDigits, normalizeValue } from './normalize.ts';
import type { TemplateField } from './types.ts';

const field = (field_type: string, extra: Record<string, unknown> = {}) =>
  ({ field_key: 'k', label_ar: 'k', field_type, is_required: true, ...extra }) as unknown as TemplateField;

Deno.test('normalizeValue: raw values of any type', () => {
  assertEquals(normalizeValue(field('varchar'), null), '');
  assertEquals(normalizeValue(field('varchar'), undefined), '');
  assertEquals(normalizeValue(field('int'), 3000), '3000');
  assertEquals(normalizeValue(field('varchar'), true), 'true');
  assertEquals(normalizeValue(field('varchar'), { a: 1 }), '', 'objects are not guessed');
});

Deno.test('normalizeValue: email, date and the default case', () => {
  assertEquals(normalizeValue(field('email'), ' Ahmed.Alaoui @Mail.com '), 'ahmed.alaoui@mail.com');
  assertEquals(normalizeValue(field('date'), '٥/٣/٢٠٢٦'), '2026-03-05', 'Arabic-Indic digits, D/M/YYYY');
  assertEquals(normalizeValue(field('date'), '2026-03-05'), '2026-03-05', 'ISO kept');
  assertEquals(normalizeValue(field('date'), 'غداً'), 'غداً', 'unparsed dates go to the validator as they are');
  assertEquals(normalizeValue(field('text'), '  نص  '), 'نص');
});

Deno.test('latinDigits / foldArabic', () => {
  assertEquals(latinDigits('٠٦١٢ ۳۴۵'), '0612 345');
  assertEquals(foldArabic('الدار البيضاء'), foldArabic('الدارالبيضاء'));
  assertEquals(foldArabic('إقليم'), foldArabic('اقليم'));
});
