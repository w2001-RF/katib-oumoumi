import { assertEquals } from 'jsr:@std/assert@1';
import { foldArabic, LATIN_NOT_ALLOWED, latinDigits, normalizeValue, validateForBot } from './normalize.ts';
import { arabicPlaceName, foldLatin } from './places.ts';
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

const CITY_OPTIONS = ['سطات', 'الدار البيضاء', 'أخرى'];

Deno.test('select: a place typed in Latin letters becomes the Arabic option', () => {
  const city = field('select', { options: CITY_OPTIONS });
  assertEquals(normalizeValue(city, 'Casablanca'), 'الدار البيضاء');
  assertEquals(normalizeValue(city, ' casa '), 'الدار البيضاء', 'case and spaces ignored');
  assertEquals(normalizeValue(city, 'FÈS'), 'فاس', 'a known place missing from the list (allowed by «أخرى») is still written in Arabic');
  assertEquals(normalizeValue(city, 'الدارالبيضاء'), 'الدار البيضاء', 'Arabic spelling variants');
  assertEquals(normalizeValue(city, 'Tiflet'), 'Tiflet', 'unknown names are left to the validator');
});

Deno.test('validateForBot: options only, free values in Arabic', () => {
  const withOther = field('select', { options: CITY_OPTIONS });
  const strict = field('select', { options: ['سطات', 'الدار البيضاء'] });
  assertEquals(validateForBot(withOther, 'سطات'), null);
  assertEquals(validateForBot(withOther, 'تيفلت'), null, '«أخرى»: a value in Arabic is accepted');
  assertEquals(validateForBot(withOther, 'Tiflet'), LATIN_NOT_ALLOWED, '«أخرى»: Latin letters are refused');
  assertEquals(validateForBot(strict, 'فاس'), 'يرجى اختيار قيمة من القائمة', 'no «أخرى»: the list only');
  assertEquals(validateForBot(field('select', { options: CITY_OPTIONS, is_required: false }), ''), null, 'optional and empty');
  assertEquals(validateForBot(field('varchar'), 'Ahmed'), null, 'other field types: the web app rules only');
});

Deno.test('places: Latin spellings', () => {
  assertEquals(arabicPlaceName("M'diq"), 'المضيق');
  assertEquals(arabicPlaceName('Meknes'), 'مكناس');
  assertEquals(arabicPlaceName('Paris'), null);
  assertEquals(arabicPlaceName('  '), null);
  assertEquals(foldLatin('Ksar El-Kébir'), 'ksarelkebir');
});
