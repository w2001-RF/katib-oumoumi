import '../support/setup.js';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { argsOf, kind, sharedClient as db } from '../support/fakeSupabase.js';
import * as api from '../../js/api.js';
import { supabaseReady } from '../../js/supabaseClient.js';

const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

Deno.test('client is configured from SUPABASE_CONFIG', () => {
  assertEquals(supabaseReady, true);
});

Deno.test('public reads return data and throw on errors', async () => {
  db.reset((call) => ok([{ table: call.table }]));
  assertEquals(await api.fetchCategories(), [{ table: 'categories' }]);
  assertEquals(await api.fetchCategory('c1'), [{ table: 'categories' }]);
  assertEquals(await api.fetchDocumentTypesByCategory('c1'), [{ table: 'document_types' }]);
  assertEquals(await api.fetchMostRequested(3), [{ table: 'document_types' }]);
  assertEquals(await api.searchDocumentTypes('شكا'), [{ table: 'document_types' }]);
  assertEquals(argsOf(db.calls.at(-1), 'ilike'), ['name_ar', '%شكا%']);
  assertEquals(await api.fetchDocumentType('d1'), [{ table: 'document_types' }]);
  assertEquals(await api.adminFetchDocumentType('d1'), [{ table: 'document_types' }]);
  assertEquals(await api.fetchTemplateFields('d1'), [{ table: 'v_template_fields' }]);
  assertEquals(await api.adminFetchAllDocumentTypes(), [{ table: 'document_types' }]);

  db.reset(() => fail('boom'));
  for (const fn of [api.fetchCategories, () => api.fetchCategory('x'), () => api.fetchDocumentTypesByCategory('x'),
    api.fetchCategoryCounts, () => api.fetchMostRequested(), () => api.searchDocumentTypes('q'),
    () => api.fetchDocumentType('x'), () => api.fetchTemplateFields('x'), api.adminFetchAllDocumentTypes,
    () => api.adminFetchSubmissions(), api.fetchOptionLists]) {
    await assertRejects(fn);
  }
});

Deno.test('fetchCategoryCounts counts published documents per category', async () => {
  db.reset(() => ok([{ category_id: 'a' }, { category_id: 'b' }, { category_id: 'a' }]));
  assertEquals(await api.fetchCategoryCounts(), { a: 2, b: 1 });
});

Deno.test('usage counter and generated-document log', async () => {
  db.reset(() => ok(null));
  await api.incrementUsage('d1');
  assertEquals(db.calls[0].rpc, 'increment_document_usage');
  db.reset(() => fail('rpc down'));
  await api.incrementUsage('d1'); // only warns

  db.reset((call) => ok({ id: 'g1', ...argsOf(call, 'insert')[0] }));
  const row = await api.logGeneratedDocument('d1', { k: 'v' });
  assertEquals([row.document_type_id, row.data], ['d1', { k: 'v' }]);
  db.reset(() => fail('nope'));
  await assertRejects(() => api.logGeneratedDocument('d1', {}));
});

Deno.test('admin auth', async () => {
  db.reset((call) => (call.auth === 'getSession' ? ok({ session: { user: 'u' } }) : ok({ user: 'u' })));
  assertEquals(await api.adminSignIn('a@b.c', 'pw'), { user: 'u' });
  await api.adminSignOut();
  assertEquals(await api.getCurrentSession(), { user: 'u' });
  let seen = null;
  api.onAuthStateChange((s) => {
    seen = s;
  });
  db.authCallback('SIGNED_IN', { user: 'x' });
  assertEquals(seen, { user: 'x' });
  db.reset(() => fail('bad credentials'));
  await assertRejects(() => api.adminSignIn('a@b.c', 'wrong'));
});

Deno.test('admin category and document writes', async () => {
  db.reset((call) => ok({ kind: kind(call), table: call.table }));
  assertEquals(await api.adminCreateCategory({ name_ar: 'x' }), { kind: 'insert', table: 'categories' });
  assertEquals(await api.adminUpdateCategory('c', { name_ar: 'y' }), { kind: 'update', table: 'categories' });
  await api.adminDeleteCategory('c');
  assertEquals(await api.adminCreateDocumentType({}), { kind: 'insert', table: 'document_types' });
  assertEquals(await api.adminUpdateDocumentType('d', { name_ar: 'z' }), { kind: 'update', table: 'document_types' });
  assertEquals(typeof argsOf(db.calls.at(-1), 'update')[0].updated_at, 'string');
  await api.adminDeleteDocumentType('d');

  db.reset(() => fail('denied'));
  for (const fn of [() => api.adminCreateCategory({}), () => api.adminUpdateCategory('c', {}), () => api.adminDeleteCategory('c'),
    () => api.adminCreateDocumentType({}), () => api.adminUpdateDocumentType('d', {}), () => api.adminDeleteDocumentType('d')]) {
    await assertRejects(fn);
  }
});

Deno.test('submissions and stats', async () => {
  db.reset(() => ok([{ id: 's' }]));
  assertEquals(await api.adminFetchSubmissions('d1', 10), [{ id: 's' }]);
  assertEquals(argsOf(db.calls.at(-1), 'eq'), ['document_type_id', 'd1']);
  await api.adminFetchSubmissions();
  assertEquals(argsOf(db.calls.at(-1), 'eq'), undefined);

  const counts = { document_types: 5, generated_documents: 9, categories: null };
  db.reset((call) => ({ data: null, error: null, count: counts[call.table] }));
  assertEquals(await api.adminStats(), { totalDocs: 5, totalGenerated: 9, totalCategories: 0 });
});

Deno.test('fetchOptionLists groups items in order', async () => {
  db.reset((call) =>
    call.table === 'option_lists'
      ? ok([{ id: 'L1', name: 'المدن' }, { id: 'L2', name: 'فارغة' }])
      : ok([{ list_id: 'L1', value: 'ب', sort_order: 1 }, { list_id: 'L1', value: 'أ', sort_order: 0 }]));
  assertEquals(await api.fetchOptionLists(), [
    { id: 'L1', name: 'المدن', items: ['أ', 'ب'] },
    { id: 'L2', name: 'فارغة', items: [] },
  ]);
});

// --- adminReplaceFields ------------------------------------------------------------

// An in-memory database for the tables adminReplaceFields touches.
function fieldsDb(initial) {
  const t = structuredClone(initial);
  let nextId = 1;
  const id = (p) => `${p}${nextId++}`;
  db.reset((call) => {
    const op = kind(call);
    const rows = t[call.table];
    if (op === 'select') {
      const eq = argsOf(call, 'eq');
      return ok(eq ? rows.filter((r) => r[eq[0]] === eq[1]) : rows);
    }
    if (op === 'insert') {
      const input = [argsOf(call, 'insert')[0]].flat();
      const created = input.map((r) => ({ id: id(call.table[0]), ...r }));
      rows.push(...created);
      return ok(Array.isArray(argsOf(call, 'insert')[0]) ? created : created[0]);
    }
    if (op === 'upsert') {
      const [input, { onConflict }] = argsOf(call, 'upsert');
      const keys = onConflict.split(',');
      for (const r of input) {
        const hit = rows.find((x) => keys.every((k) => x[k] === r[k]));
        if (hit) Object.assign(hit, r);
        else rows.push({ id: id('u'), ...r });
      }
      return ok(null);
    }
    if (op === 'delete') {
      const ids = new Set(argsOf(call, 'in')[1]);
      t[call.table] = rows.filter((r) => !ids.has(r.id));
      return ok(null);
    }
    return fail(`unexpected ${op}`);
  });
  return t;
}

const BASE = {
  option_lists: [{ id: 'L1', name: 'المدن' }],
  option_list_items: [
    { id: 'i1', list_id: 'L1', value: 'سطات', sort_order: 0 },
    { id: 'i2', list_id: 'L1', value: 'فاس', sort_order: 1 },
  ],
  field_definitions: [
    { id: 'F1', field_key: 'المدينة', label_ar: 'المدينة', field_type: 'select', placeholder_ar: '', option_list_id: 'L1' },
    { id: 'F2', field_key: 'الاسم', label_ar: 'الاسم', field_type: 'varchar', placeholder_ar: '', option_list_id: null },
  ],
  document_type_fields: [{ id: 'X1', document_type_id: 'D', field_id: 'F2', is_required: true, sort_order: 0 }],
};

Deno.test('adminReplaceFields: reuses definitions, edits a shared list, creates a new list once, rewrites links', async () => {
  const t = fieldsDb(BASE);
  await api.adminReplaceFields('D', [
    { field_key: 'المدينة', label_ar: 'مدينتك', field_type: 'select', placeholder_ar: '', is_required: true,
      options: ['سطات', 'الرباط'], option_list_id: 'L1' },
    { field_key: 'المدة', label_ar: 'المدة', field_type: 'select', placeholder_ar: '', is_required: false,
      options: ['شهر', 'سنة', 'شهر'], option_list_id: api.NEW_OPTION_LIST, list_name: 'المدد' },
    { field_key: 'المدة الثانية', label_ar: 'مدة أخرى', field_type: 'select', placeholder_ar: '', is_required: false,
      options: ['شهر', 'سنة'], option_list_id: api.NEW_OPTION_LIST, list_name: 'المدد' },
  ]);

  // the shared list now holds exactly the new items
  assertEquals(t.option_list_items.filter((i) => i.list_id === 'L1').map((i) => i.value).sort(), ['الرباط', 'سطات']);
  // the new list was created once, with deduplicated items
  const created = t.option_lists.filter((l) => l.name === 'المدد');
  assertEquals(created.length, 1);
  assertEquals(t.option_list_items.filter((i) => i.list_id === created[0].id).map((i) => i.value), ['شهر', 'سنة']);
  // links: label override kept only where it differs; old link (الاسم) removed
  const links = t.document_type_fields.filter((l) => l.document_type_id === 'D');
  assertEquals(links.length, 3);
  assertEquals(links.find((l) => l.field_id === 'F1').label_ar, 'مدينتك');
  assertEquals(links.some((l) => l.field_id === 'F2'), false);
  const newDef = t.field_definitions.find((d) => d.field_key === 'المدة');
  assertEquals(newDef.option_list_id, created[0].id);
  assertEquals(links.find((l) => l.field_id === newDef.id).label_ar, null);
});

Deno.test('adminReplaceFields refuses invalid lists before writing anything', async () => {
  const cases = [
    [{ option_list_id: api.NEW_OPTION_LIST, list_name: '  ' }, 'يرجى إدخال اسم القائمة الجديدة'],
    [{ option_list_id: api.NEW_OPTION_LIST, list_name: 'المدن' }, 'اسم القائمة "المدن" مستعمل، اختر اسماً آخر'],
    [{ option_list_id: 'missing' }, 'يرجى اختيار قائمة الاختيارات للحقل "س"'],
  ];
  for (const [extra, message] of cases) {
    fieldsDb(BASE);
    const err = await assertRejects(() =>
      api.adminReplaceFields('D', [{ field_key: 'س', label_ar: 'س', field_type: 'select', options: ['x'], ...extra }]));
    assertEquals(err.userMessage, message);
    assertEquals(db.calls.filter((c) => kind(c) !== 'select').length, 0);
  }
});

Deno.test('adminReplaceFields refuses to change a shared definition', async () => {
  fieldsDb(BASE);
  const typeErr = await assertRejects(() =>
    api.adminReplaceFields('D', [{ field_key: 'الاسم', label_ar: 'الاسم', field_type: 'int' }]));
  assertEquals(typeErr.userMessage, 'مفتاح الحقل "الاسم" مستعمل بنوع مختلف في وثائق أخرى');

  fieldsDb({ ...BASE, option_lists: [...BASE.option_lists, { id: 'L2', name: 'أخرى' }] });
  const listErr = await assertRejects(() =>
    api.adminReplaceFields('D', [{ field_key: 'المدينة', label_ar: 'المدينة', field_type: 'select', options: [], option_list_id: 'L2' }]));
  assertEquals(listErr.userMessage, 'الحقل "المدينة" مستعمل في وثائق أخرى بقائمة اختيارات مختلفة');
});

Deno.test('adminReplaceFields: no fields removes every link; database errors propagate', async () => {
  const t = fieldsDb(BASE);
  await api.adminReplaceFields('D', []);
  assertEquals(t.document_type_fields.filter((l) => l.document_type_id === 'D'), []);

  for (const failing of ['field_definitions', 'document_type_fields', 'option_list_items']) {
    fieldsDb(BASE);
    const inner = db.handler;
    db.handler = (call) => (call.table === failing && kind(call) !== 'select' ? fail(`${failing} down`) : inner(call));
    await assertRejects(() =>
      api.adminReplaceFields('D', [
        { field_key: 'جديد', label_ar: 'جديد', field_type: 'varchar' },
        { field_key: 'المدينة', label_ar: 'المدينة', field_type: 'select', options: ['x'], option_list_id: 'L1' },
      ]));
  }
});
