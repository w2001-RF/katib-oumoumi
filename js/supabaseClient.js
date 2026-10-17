import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// window.SUPABASE_CONFIG is generated at deploy time by
// .github/workflows/deploy-pages.yml (see supabase-config.example.js for
// local development).

/** { ready, client }: a client when the config has a URL and a key, else null (and a console error). */
export function connectSupabase(config, { create = createClient, log = console } = {}) {
  const ready = !!(config?.url && config?.anonKey);
  if (!ready) {
    log.error('Supabase غير مهيأ: تأكد من وجود supabase-config.js (انظر README.md و supabase-config.example.js).');
    return { ready, client: null };
  }
  return { ready, client: create(config.url, config.anonKey) };
}

const connection = connectSupabase(globalThis.SUPABASE_CONFIG);

export const supabaseReady = connection.ready;
export const supabase = connection.client;
