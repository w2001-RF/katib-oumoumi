import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { ensureExportLibs, EXPORT_LIBS } from '../../js/utils/exportLibs.js';
import { loadScript, resetScriptCache } from '../../js/utils/loadScript.js';

Deno.test('export libraries: only the missing ones are loaded', async () => {
  const loaded = [];
  const load = (src, _doc, { integrity }) => {
    loaded.push([src, integrity]);
    return Promise.resolve();
  };
  await ensureExportLibs(['saveAs', 'htmlDocx', 'jspdf'], { win: { jspdf: {} }, load });
  assertEquals(loaded, [
    [EXPORT_LIBS.saveAs.src, EXPORT_LIBS.saveAs.integrity],
    [EXPORT_LIBS.htmlDocx.src, EXPORT_LIBS.htmlDocx.integrity],
  ]);
  for (const lib of Object.values(EXPORT_LIBS)) assertEquals(lib.integrity.startsWith('sha384-'), true);

  loaded.length = 0;
  await ensureExportLibs(['saveAs'], { win: { saveAs: () => {} }, load });
  assertEquals(loaded, [], 'already on the page');
});

Deno.test('export libraries: a blocked script gives a readable error', async () => {
  const load = () => Promise.reject(new Error('blocked'));
  await assertRejects(() => ensureExportLibs(['jspdf'], { win: {}, load }), Error, 'تعذر تحميل مكتبة التصدير');
});

Deno.test('loadScript: pins the content with integrity + CORS when given a hash', async () => {
  resetScriptCache();
  const added = [];
  const doc = { createElement: () => ({}), head: { appendChild: (el) => added.push(el) } };
  const pinned = loadScript('https://cdn.example/a.js', doc, { integrity: 'sha384-abc' });
  loadScript('https://cdn.example/b.js', doc);
  assertEquals([added[0].integrity, added[0].crossOrigin], ['sha384-abc', 'anonymous']);
  assertEquals([added[1].integrity, added[1].crossOrigin], [undefined, undefined], 'no hash: plain tag');
  added[0].onload();
  await pinned;
  resetScriptCache();
});
