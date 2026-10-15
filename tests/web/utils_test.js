import { assert, assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';
import { escapeHtml, formatDateAr, formatDateTimeShort, MOROCCAN_MONTHS, slugifyKey, textToHtml, uid } from '../../js/utils/format.js';
import icon, { CATEGORY_ICON_COLORS, icon as namedIcon } from '../../js/utils/icons.js';
import { renderTemplate, sampleValuesFor } from '../../js/utils/templateEngine.js';
import {
  FIELD_TYPES, fieldOptions, fieldTypeLabel, hasOtherOption, inputTypeFor, OTHER_OPTION, validateField,
} from '../../js/utils/validators.js';

Deno.test('formatDateAr uses Moroccan month names', () => {
  assertEquals(formatDateAr('2026-08-03'), '3 غشت 2026');
  assertEquals(formatDateAr('2026-12-25'), '25 دجنبر 2026');
  assertEquals(formatDateAr(''), '');
  assertEquals(formatDateAr('not a date'), 'not a date');
  assertEquals(formatDateAr('2026-13-01'), '1 13 2026');
  assertEquals(MOROCCAN_MONTHS.length, 12);
});

Deno.test('formatDateTimeShort', () => {
  const d = new Date(2026, 7, 3, 2, 5);
  assertEquals(formatDateTimeShort(d), '02:05 · 3 غشت 2026');
  assertEquals(formatDateTimeShort('nonsense'), '');
});

Deno.test('escapeHtml / textToHtml / slugifyKey', () => {
  assertEquals(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assertEquals(escapeHtml(null), '');
  assertEquals(textToHtml('a\n<b>'), 'a<br/>&lt;b&gt;');
  assertEquals(slugifyKey('  المدينة '), 'المدينة');
});

Deno.test('uid returns distinct v4 UUIDs', () => {
  const a = uid();
  assertMatch(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert(a !== uid());
});

Deno.test('uid falls back to getRandomValues outside secure contexts', () => {
  const original = globalThis.crypto.randomUUID;
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    assertMatch(uid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
  }
});

Deno.test('icons', () => {
  assertStringIncludes(namedIcon('search'), '<svg');
  assertEquals(icon, namedIcon);
  assertStringIncludes(namedIcon('does-not-exist'), '<svg');
  assertStringIncludes(namedIcon('search', 'big'), '<span class="big"><svg');
  assert(CATEGORY_ICON_COLORS.length > 0);
});

const f = (field_type, extra = {}) => ({ field_type, is_required: true, options: [], ...extra });

Deno.test('validateField: required, optional and every type', () => {
  assertEquals(validateField(f('varchar'), ''), 'هذا الحقل إلزامي');
  assertEquals(validateField(f('varchar', { is_required: false }), '  '), null);
  assertEquals(validateField(f('varchar'), 'x'), null);
  assertEquals(validateField(f('int'), '12'), null);
  assertEquals(validateField(f('int'), '1.5'), 'يرجى إدخال رقم صحيح');
  assertEquals(validateField(f('date'), '2026-01-02'), null);
  assertEquals(validateField(f('date'), '2/1/2026'), 'يرجى اختيار تاريخ صحيح');
  assertEquals(validateField(f('phone'), '06 12-34 56 78'), null);
  assertEquals(validateField(f('phone'), '0412345678'), 'رقم الهاتف غير صحيح (مثال: 06XXXXXXXX)');
  assertEquals(validateField(f('email'), 'a@b.ma'), null);
  for (const bad of ['a@b', 'a b@c.d', 'a@b@c.d', '@b.c', 'a@.bc', 'a@bc.']) {
    assertEquals(validateField(f('email'), bad), 'البريد الإلكتروني غير صحيح', bad);
  }
  assertEquals(validateField(f('cin'), 'G754103'), null);
  assertEquals(validateField(f('cin'), '754103'), 'رقم البطاقة الوطنية غير صحيح (مثال: G754103)');
  assertEquals(validateField(f('select', { options: ['سطات'] }), 'سطات'), null);
  assertEquals(validateField(f('select', { options: ['سطات'] }), 'فاس'), 'يرجى اختيار قيمة من القائمة');
  assertEquals(validateField(f('select', { options: ['سطات', OTHER_OPTION] }), 'فاس'), null);
  assertEquals(validateField(f('select'), 'anything'), null);
  assertEquals(validateField(f('unknown-type'), 'anything'), null);
  assertEquals(validateField(f('varchar'), 42), null);
});

Deno.test('field type helpers', () => {
  assertEquals(FIELD_TYPES.length, 8);
  assertEquals(fieldTypeLabel('cin'), 'رقم البطاقة الوطنية');
  assertEquals(fieldTypeLabel('zzz'), 'zzz');
  assertEquals(fieldOptions({ options: 'not-an-array' }), []);
  assertEquals(hasOtherOption({ options: [OTHER_OPTION] }), true);
  assertEquals(
    ['int', 'date', 'phone', 'email', 'varchar'].map(inputTypeFor),
    ['number', 'date', 'tel', 'email', 'text'],
  );
});

Deno.test('renderTemplate fills, formats and escapes; sampleValuesFor', () => {
  const fields = [
    { field_key: 'الاسم', field_type: 'varchar' },
    { field_key: 'التاريخ', field_type: 'date' },
    { field_key: 'الوقائع', field_type: 'text' },
    { field_key: 'فارغ', field_type: 'varchar' },
  ];
  const html = renderTemplate('{{الاسم}}|{{التاريخ}}|{{الوقائع}}|{{فارغ}}', fields, {
    الاسم: '<b>', التاريخ: '2026-08-03', الوقائع: 'سطر\nسطر',
  });
  assertEquals(html, '&lt;b&gt;|3 غشت 2026|سطر<br/>سطر|.....');
  assertEquals(renderTemplate(null, [], {}), '');

  const samples = sampleValuesFor([
    { field_key: 'a', field_type: 'select', options: ['x'] },
    { field_key: 'b', field_type: 'cin' },
    { field_key: 'c', field_type: 'mystery' },
  ]);
  assertEquals(samples, { a: 'x', b: 'A123456', c: 'قيمة' });
});
