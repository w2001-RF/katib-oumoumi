import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuthAwareFetch } from './authFetch.js';

// window.SUPABASE_CONFIG is generated at deploy time by
// .github/workflows/deploy-pages.yml (see supabase-config.example.js for
// local development).

/** Fired on window when the admin session expired and could not be refreshed (handled in main.js). */
export const SESSION_EXPIRED_EVENT = 'ko:session-expired';

/** { ready, client }: a client when the config has a URL and a key, else null (and a console error). */
export function connectSupabase(config, { create = createClient, log = console, baseFetch = globalThis.fetch } = {}) {
  const ready = !!(config?.url && config?.anonKey);
  if (!ready) {
    log.error('Supabase غير مهيأ: تأكد من وجود supabase-config.js (انظر README.md و supabase-config.example.js).');
    return { ready, client: null };
  }
  let client = null;
  const fetch = createAuthAwareFetch({
    baseFetch: (...args) => baseFetch(...args),
    refresh: async () => {
      const { data, error } = await client.auth.refreshSession();
      return error ? null : data?.session?.access_token ?? null;
    },
    onExpired: () => globalThis.dispatchEvent?.(new Event(SESSION_EXPIRED_EVENT)),
  });
  client = create(config.url, config.anonKey, { global: { fetch } });
  return { ready, client };
}

const connection = connectSupabase(globalThis.SUPABASE_CONFIG);

export const supabaseReady = connection.ready;
export const supabase = connection.client;
