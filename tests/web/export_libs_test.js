import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { ensureExportLibs, EXPORT_LIBS } from '../../js/utils/exportLibs.js';

Deno.test('export libraries: only the missing ones are loaded', async () => {
  const loaded = [];
  const load = (src) => {
    loaded.push(src);
    return Promise.resolve();
  };
  await ensureExportLibs(['saveAs', 'htmlDocx', 'jspdf'], { win: { jspdf: {} }, load });
  assertEquals(loaded, [EXPORT_LIBS.saveAs, EXPORT_LIBS.htmlDocx]);

  loaded.length = 0;
  await ensureExportLibs(['saveAs'], { win: { saveAs: () => {} }, load });
  assertEquals(loaded, [], 'already on the page');
});

Deno.test('export libraries: a blocked script gives a readable error', async () => {
  const load = () => Promise.reject(new Error('blocked'));
  await assertRejects(() => ensureExportLibs(['jspdf'], { win: {}, load }), Error, 'تعذر تحميل مكتبة التصدير');
});
