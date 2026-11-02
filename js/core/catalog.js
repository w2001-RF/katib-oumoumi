// The public side of the catalog: categories, documents and their fields,
// plus the two writes a citizen's device makes when a document is generated.
// Shared by the web app (js/api.js) and the mobile app (mobile/src/api.js):
// each platform builds its own Supabase client and passes it in.

/**
 * @param {object|null} supabase  a supabase-js client (null when not configured)
 * @param {{ getSessionId: () => string }} deps  the device's anonymous id
 */
export function createCatalog(supabase, { getSessionId }) {
  // Every call is async, so a missing client or a database error both
  // reject the returned promise.
  async function run(build) {
    if (!supabase) throw new Error('Supabase client is not configured.');
    const { data, error } = await build(supabase);
    if (error) throw error;
    return data;
  }

  const publishedDocs = (db) => db.from('document_types').select('*').eq('is_published', true);

  return {
    fetchCategories: () =>
      run((db) => db.from('categories').select('*').order('sort_order', { ascending: true })),

    fetchCategory: (id) => run((db) => db.from('categories').select('*').eq('id', id).single()),

    fetchDocumentTypesByCategory: (categoryId) =>
      run((db) => publishedDocs(db).eq('category_id', categoryId).order('sort_order', { ascending: true })),

    // { [category_id]: number of published documents }
    async fetchCategoryCounts() {
      const rows = await run((db) => db.from('document_types').select('category_id').eq('is_published', true));
      const counts = {};
      for (const row of rows) counts[row.category_id] = (counts[row.category_id] || 0) + 1;
      return counts;
    },

    fetchMostRequested: (limit = 5) =>
      run((db) => publishedDocs(db).order('usage_count', { ascending: false }).limit(limit)),

    searchDocumentTypes: (query) =>
      run((db) => publishedDocs(db).ilike('name_ar', `%${query}%`).order('usage_count', { ascending: false }).limit(20)),

    fetchDocumentType: (id) => run((db) => db.from('document_types').select('*').eq('id', id).single()),

    // Fields of a document, flattened by the v_template_fields view: catalog
    // defaults with the document's overrides applied and the dropdown choices
    // inlined as `options`.
    fetchTemplateFields: (documentTypeId) =>
      run((db) => db.from('v_template_fields').select('*')
        .eq('document_type_id', documentTypeId)
        .order('sort_order', { ascending: true })),

    async incrementUsage(documentTypeId) {
      await run((db) => db.rpc('increment_document_usage', { doc_id: documentTypeId }))
        .catch((error) => console.warn('increment_document_usage failed', error));
    },

    logGeneratedDocument: (documentTypeId, data) =>
      run((db) => db.from('generated_documents')
        .insert({ document_type_id: documentTypeId, session_id: getSessionId(), data })
        .select()
        .single()),
  };
}
