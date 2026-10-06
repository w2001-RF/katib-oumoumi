import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// window.SUPABASE_CONFIG is generated at deploy time by
// .github/workflows/deploy-pages.yml (see supabase-config.example.js for
// local development).
const config = window.SUPABASE_CONFIG;

export const supabaseReady = !!(config && config.url && config.anonKey);

export const supabase = supabaseReady
  ? createClient(config.url, config.anonKey)
  : null;

if (!supabaseReady) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase غير مهيأ: تأكد من وجود supabase-config.js (انظر README.md و supabase-config.example.js).'
  );
}
