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

export async function fetchTemplateFields(documentTypeId) {
  assertClient();
  const { data, error } = await supabase
    .from('template_fields')
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

export async function adminReplaceFields(documentTypeId, fields) {
  assertClient();
  // Simplicity over granular diffing: wipe and re-insert on every save.
  const { error: delErr } = await supabase.from('template_fields').delete().eq('document_type_id', documentTypeId);
  if (delErr) throw delErr;
  if (!fields.length) return [];
  const rows = fields.map((f, i) => ({
    document_type_id: documentTypeId,
    field_key: f.field_key,
    label_ar: f.label_ar,
    field_type: f.field_type,
    is_required: f.is_required,
    placeholder_ar: f.placeholder_ar || '',
    sort_order: i,
  }));
  const { data, error } = await supabase.from('template_fields').insert(rows).select();
  if (error) throw error;
  return data;
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
