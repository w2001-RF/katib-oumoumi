// Admin dashboard → live status of the agent (see handler.ts).
//
// Deploy from the repository root (same bundle rules as telegram-webhook):
//   npx supabase functions deploy agent-status --use-api
// JWT verification stays ON (supabase/config.toml); on top of it the caller
// must be a signed-in, non-anonymous user — the admin account.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { createStatusHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(
  createStatusHandler({
    env: (name) => Deno.env.get(name),
    authorize: async (req) => {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
      if (!token || !url || !anonKey) return false;
      const { data, error } = await createClient(url, anonKey, { auth: { persistSession: false } }).auth.getUser(token);
      return !error && !!data.user && !data.user.is_anonymous;
    },
  }),
);
