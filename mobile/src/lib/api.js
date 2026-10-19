// The catalog of documents, through the same queries as the web app.
import { createClient } from '@supabase/supabase-js';
import { createCatalog, getSessionId } from './core';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseReady = Boolean(url && anonKey);
if (!supabaseReady) {
  console.error('Supabase غير مهيأ: انسخ mobile/.env.example إلى mobile/.env واملأ القيم.');
}

// Citizens never sign in on mobile (no admin screens here): no session to keep.
const supabase = supabaseReady
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  : null;

export const {
  fetchCategories,
  fetchCategory,
  fetchDocumentTypesByCategory,
  fetchCategoryCounts,
  fetchMostRequested,
  searchDocumentTypes,
  fetchDocumentType,
  fetchTemplateFields,
  incrementUsage,
  logGeneratedDocument,
} = createCatalog(supabase, { getSessionId });
