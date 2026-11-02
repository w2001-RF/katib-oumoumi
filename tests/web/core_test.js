// js/core: the modules shared by the web app, the mobile app and the bot.
import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { argsOf, createFakeClient } from '../support/fakeSupabase.js';
import { createCatalog } from '../../js/core/catalog.js';
import { documentHtml } from '../../js/core/documentHtml.js';
import { normalizeForSearch } from '../../js/core/arabicSearch.js';
import { BRAND_SVG } from '../../js/core/brandMark.js';
import { ICONS } from '../../js/core/iconPaths.js';

const ok = (data) => ({ data, error: null });

Deno.test('createCatalog: reads go through the given client and errors propagate', async () => {
  const db = createFakeClient((call) => ok([{ table: call.table }]));
  const catalog = createCatalog(db, { getSessionId: () => 's1' });
  assertEquals(await catalog.fetchCategories(), [{ table: 'categories' }]);
  assertEquals(await catalog.searchDocumentTypes('توكيل'), [{ table: 'document_types' }]);
  assertEquals(argsOf(db.calls.at(-1), 'ilike'), ['name_ar', '%توكيل%']);
  assertEquals(argsOf(db.calls.at(-1), 'eq'), ['is_published', true]);

  db.handler = () => ({ data: null, error: { message: 'boom' } });
  await assertRejects(() => catalog.fetchTemplateFields('d1'));
});

Deno.test('createCatalog: a generated document is logged with the device id', async () => {
  const db = createFakeClient(() => ok({ id: 'g1' }));
  const catalog = createCatalog(db, { getSessionId: () => 'device-42' });
  assertEquals(await catalog.logGeneratedDocument('d1', { a: '1' }), { id: 'g1' });
  assertEquals(argsOf(db.calls.at(-1), 'insert'), [{ document_type_id: 'd1', session_id: 'device-42', data: { a: '1' } }]);
});

Deno.test('createCatalog: without a client every call says so', async () => {
  const catalog = createCatalog(null, { getSessionId: () => 's' });
  await assertRejects(() => catalog.fetchCategories(), Error, 'not configured');
});

Deno.test('documentHtml: RTL Arabic page, escaped title, extra CSS', () => {
  const html = documentHtml('<p>نص</p>', 'شكاية <1>', { extraCss: '@page { margin: 15mm; }' });
  assertStringIncludes(html, '<html dir="rtl" lang="ar">');
  assertStringIncludes(html, '<title>شكاية &lt;1&gt;</title>');
  assertStringIncludes(html, '@page { margin: 15mm; }');
  assertStringIncludes(html, '<body><p>نص</p></body>');
});

Deno.test('normalizeForSearch: hamza, ta marbuta, alif maqsura and spaces', () => {
  assertEquals(normalizeForSearch('أكادير'), normalizeForSearch('اكادير'));
  assertEquals(normalizeForSearch('  مدينة   طنجة '), 'مدينه طنجه');
  assertEquals(normalizeForSearch('مستشفى'), 'مستشفي');
});

Deno.test('shared drawings are standalone SVG strings', () => {
  assert(BRAND_SVG.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  for (const name of ['home', 'grid', 'history', 'settings', 'document', 'search']) {
    assert(ICONS[name]?.startsWith('<svg '), name);
  }
});
