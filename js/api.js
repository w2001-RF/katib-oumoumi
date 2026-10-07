import { supabase } from './supabaseClient.js';
import { getSessionId } from './session.js';

function assertClient() {
  if (!supabase) throw new Error('Supabase client is not configured.');
}

// --- Public reads -----------------------------------------------------------

export async function fetchCategories() {
  assertClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchCategory(id) {
  assertClient();
  const { data, error } = await supabase.from('categories').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchDocumentTypesByCategory(categoryId) {
  assertClient();
  const { data, error } = await supabase
    .from('document_types')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchCategoryCounts() {
  assertClient();
  const { data, error } = await supabase
    .from('document_types')
    .select('category_id')
    .eq('is_published', true);
  if (error) throw error;
  const counts = {};
  for (const row of data) counts[row.category_id] = (counts[row.category_id] || 0) + 1;
  return counts;
}

export async function fetchMostRequested(limit = 5) {
  assertClient();
  const { data, error } = await supabase
    .from('document_types')
    .select('*')
    .eq('is_published', true)
    .order('usage_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function searchDocumentTypes(query) {
  assertClient();
  const { data, error } = await supabase
    .from('document_types')
    .select('*')
    .eq('is_published', true)
    .ilike('name_ar', `%${query}%`)
    .order('usage_count', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function fetchDocumentType(id) {
  assertClient();
  const { data, error } = await supabase.from('document_types').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Fields of a document, flattened by the v_template_fields view: catalog
// defaults with the document's overrides applied and the dropdown choices
// inlined as `options`.
export async function fetchTemplateFields(documentTypeId) {
  assertClient();
  const { data, error } = await supabase
    .from('v_template_fields')
    .select('*')
    .eq('document_type_id', documentTypeId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function incrementUsage(documentTypeId) {
  assertClient();
  const { error } = await supabase.rpc('increment_document_usage', { doc_id: documentTypeId });
  if (error) console.warn('increment_document_usage failed', error);
}

export async function logGeneratedDocument(documentTypeId, data) {
  assertClient();
  const { data: row, error } = await supabase
    .from('generated_documents')
    .insert({ document_type_id: documentTypeId, session_id: getSessionId(), data })
    .select()
    .single();
  if (error) throw error;
  return row;
}

// --- Admin auth ---------------------------------------------------------------

export async function adminSignIn(email, password) {
  assertClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function adminSignOut() {
  assertClient();
  await supabase.auth.signOut();
}

export async function getCurrentSession() {
  assertClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  assertClient();
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// --- Admin writes ---------------------------------------------------------------

export async function adminFetchDocumentType(id) {
  assertClient();
  const { data, error } = await supabase.from('document_types').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function adminFetchAllDocumentTypes() {
  assertClient();
  const { data, error } = await supabase
    .from('document_types')
    .select('*, categories(name_ar)')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function adminCreateCategory(payload) {
  assertClient();
  const { data, error } = await supabase.from('categories').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function adminUpdateCategory(id, payload) {
  assertClient();
  const { data, error } = await supabase.from('categories').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function adminDeleteCategory(id) {
  assertClient();
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function adminCreateDocumentType(payload) {
  assertClient();
  const { data, error } = await supabase.from('document_types').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function adminUpdateDocumentType(id, payload) {
  assertClient();
  const { data, error } = await supabase
    .from('document_types')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adminDeleteDocumentType(id) {
  assertClient();
  const { error } = await supabase.from('document_types').delete().eq('id', id);
  if (error) throw error;
}

// --- Dropdown choice lists ---------------------------------------------------

// Value of a field's `option_list_id` meaning "create a new list for it".
export const NEW_OPTION_LIST = '__new__';

// An error whose message can be shown to the admin as is.
function userError(message) {
  const e = new Error(message);
  e.userMessage = message;
  return e;
}

// Every option list with its items in order: [{ id, name, items: [string] }].
export async function fetchOptionLists() {
  assertClient();
  const [lists, items] = await Promise.all([
    supabase.from('option_lists').select('id, name').order('name'),
    supabase.from('option_list_items').select('list_id, value, sort_order'),
  ]);
  if (lists.error) throw lists.error;
  if (items.error) throw items.error;
  return lists.data.map((l) => ({
    ...l,
    items: items.data
      .filter((i) => i.list_id === l.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.value),
  }));
}

async function createOptionList(name, items) {
  const { data: list, error } = await supabase.from('option_lists').insert({ name }).select().single();
  if (error) throw error;
  if (items.length) {
    const rows = items.map((value, i) => ({ list_id: list.id, value, sort_order: i }));
    const { error: itemsErr } = await supabase.from('option_list_items').insert(rows);
    if (itemsErr) throw itemsErr;
  }
  return list.id;
}

// Makes the list hold exactly `items`, in that order. New and kept values
// are written first, removed ones deleted last, so a failure never leaves
// the list emptier than it was.
async function replaceOptionListItems(listId, items) {
  const { data: existing, error } = await supabase.from('option_list_items').select('id, value').eq('list_id', listId);
  if (error) throw error;
  if (items.length) {
    const rows = items.map((value, i) => ({ list_id: listId, value, sort_order: i }));
    const { error: upErr } = await supabase.from('option_list_items').upsert(rows, { onConflict: 'list_id,value' });
    if (upErr) throw upErr;
  }
  const keep = new Set(items);
  const removedIds = existing.filter((r) => !keep.has(r.value)).map((r) => r.id);
  if (removedIds.length) {
    const { error: delErr } = await supabase.from('option_list_items').delete().in('id', removedIds);
    if (delErr) throw delErr;
  }
}

const sameItems = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- Document fields -----------------------------------------------------------
//
// A field is two things: its *definition* (key, type, default label and
// placeholder, dropdown list) — one row per key, shared by every document —
// and its *use* in a document (order, required, optional label/placeholder
// override). Saving a document therefore:
//   1. creates / updates the dropdown lists its fields use,
//   2. reuses the definition of each existing key and creates the missing
//      ones (a shared definition is never changed from here, so editing one
//      document cannot silently alter another),
//   3. rewrites the document's field links.
// `fields`: [{ field_key, label_ar, field_type, placeholder_ar, is_required,
//              options, option_list_id, list_name }] in display order.
export async function adminReplaceFields(documentTypeId, fields) {
  assertClient();

  // 1. dropdown lists
  const lists = await fetchOptionLists();
  const listIdByKey = new Map();
  const createdByName = new Map();
  const updatedLists = new Set();
  for (const f of fields) {
    if (f.field_type !== 'select') continue;
    const items = [...new Set((f.options || []).map((o) => o.trim()).filter(Boolean))];
    if (f.option_list_id === NEW_OPTION_LIST) {
      const name = (f.list_name || '').trim();
      if (!name) throw userError('يرجى إدخال اسم القائمة الجديدة');
      if (!createdByName.has(name)) {
        if (lists.some((l) => l.name === name)) throw userError(`اسم القائمة "${name}" مستعمل، اختر اسماً آخر`);
        createdByName.set(name, await createOptionList(name, items));
      }
      listIdByKey.set(f.field_key, createdByName.get(name));
    } else {
      const list = lists.find((l) => l.id === f.option_list_id);
      if (!list) throw userError(`يرجى اختيار قائمة الاختيارات للحقل "${f.label_ar}"`);
      if (!updatedLists.has(list.id) && !sameItems(list.items, items)) await replaceOptionListItems(list.id, items);
      updatedLists.add(list.id);
      listIdByKey.set(f.field_key, list.id);
    }
  }

  // 2. definitions
  const { data: defs, error: defsErr } = await supabase.from('field_definitions').select('*');
  if (defsErr) throw defsErr;
  const defByKey = new Map(defs.map((d) => [d.field_key, d]));
  const toCreate = [];
  for (const f of fields) {
    const def = defByKey.get(f.field_key);
    if (!def) {
      toCreate.push({
        field_key: f.field_key,
        label_ar: f.label_ar,
        field_type: f.field_type,
        placeholder_ar: f.placeholder_ar || '',
        option_list_id: f.field_type === 'select' ? listIdByKey.get(f.field_key) : null,
      });
    } else if (def.field_type !== f.field_type) {
      throw userError(`مفتاح الحقل "${f.field_key}" مستعمل بنوع مختلف في وثائق أخرى`);
    } else if (f.field_type === 'select' && def.option_list_id !== listIdByKey.get(f.field_key)) {
      throw userError(`الحقل "${f.field_key}" مستعمل في وثائق أخرى بقائمة اختيارات مختلفة`);
    }
  }
  if (toCreate.length) {
    const { data: created, error: createErr } = await supabase.from('field_definitions').insert(toCreate).select();
    if (createErr) throw createErr;
    created.forEach((d) => defByKey.set(d.field_key, d));
  }

  // 3. links: keep the label / placeholder only where they differ from the definition's
  const rows = fields.map((f, i) => {
    const def = defByKey.get(f.field_key);
    const placeholder = f.placeholder_ar || '';
    return {
      document_type_id: documentTypeId,
      field_id: def.id,
      label_ar: f.label_ar !== def.label_ar ? f.label_ar : null,
      placeholder_ar: placeholder !== def.placeholder_ar ? placeholder : null,
      is_required: f.is_required,
      sort_order: i,
    };
  });
  const { data: existing, error: existingErr } = await supabase
    .from('document_type_fields')
    .select('id, field_id')
    .eq('document_type_id', documentTypeId);
  if (existingErr) throw existingErr;
  if (rows.length) {
    const { error: upErr } = await supabase
      .from('document_type_fields')
      .upsert(rows, { onConflict: 'document_type_id,field_id' });
    if (upErr) throw upErr;
  }
  const kept = new Set(rows.map((r) => r.field_id));
  const removedIds = existing.filter((r) => !kept.has(r.field_id)).map((r) => r.id);
  if (removedIds.length) {
    const { error: delErr } = await supabase.from('document_type_fields').delete().in('id', removedIds);
    if (delErr) throw delErr;
  }
}

export async function adminFetchSubmissions(documentTypeId, limit = 50) {
  assertClient();
  let q = supabase.from('generated_documents').select('*').order('created_at', { ascending: false }).limit(limit);
  if (documentTypeId) q = q.eq('document_type_id', documentTypeId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function adminStats() {
  assertClient();
  const [{ count: totalDocs }, { count: totalGenerated }, { count: totalCategories }] = await Promise.all([
    supabase.from('document_types').select('*', { count: 'exact', head: true }),
    supabase.from('generated_documents').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
  ]);
  return { totalDocs: totalDocs || 0, totalGenerated: totalGenerated || 0, totalCategories: totalCategories || 0 };
}
