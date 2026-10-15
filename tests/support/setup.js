// Imported first by the web tests: the browser globals the web modules read
// when they load (window.SUPABASE_CONFIG), before js/supabaseClient.js runs.
globalThis.SUPABASE_CONFIG = { url: 'https://example.supabase.co', anonKey: 'test-anon-key' };
