import '../support/setup.js';
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createAuthAwareFetch, isExpiredJwt } from '../../js/authFetch.js';
import {
  EXPIRED_MESSAGE, handleSessionExpired, installSessionExpiryHandler, isAdminPath, rememberReturnPath, takeExpiredNotice,
  takeReturnPath,
} from '../../js/admin/sessionExpiry.js';
import { connectSupabase, SESSION_EXPIRED_EVENT } from '../../js/supabaseClient.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const EXPIRED = () => json(401, { code: 'PGRST303', message: 'JWT expired' });

/** A fetch that answers from a list and records the Authorization header of each call. */
function scriptedFetch(responses) {
  const auth = [];
  const urls = [];
  const fetch = (input, init = {}) => {
    urls.push(String(input));
    auth.push(new Headers(init.headers).get('Authorization'));
    return Promise.resolve(responses.shift()());
  };
  return { fetch, auth, urls };
}

class MemoryStorage {
  map = new Map();
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

Deno.test('isExpiredJwt: PostgREST and Edge Function wordings, 401 only', () => {
  assert(isExpiredJwt(401, '{"code":"PGRST303","message":"JWT expired"}'));
  assert(isExpiredJwt(401, '{"code":401,"message":"Invalid JWT"}'), 'Edge Functions gateway (verify_jwt)');
  assert(!isExpiredJwt(401, '{"message":"Missing authorization header"}'));
  assert(!isExpiredJwt(403, 'JWT expired'));
  assert(!isExpiredJwt(401, undefined));
});

Deno.test('authFetch: an expired token is refreshed and the request replayed once', async () => {
  const { fetch, auth } = scriptedFetch([EXPIRED, () => json(200, { ok: true })]);
  let expired = 0;
  const f = createAuthAwareFetch({ baseFetch: fetch, refresh: () => 'new-token', onExpired: () => expired++ });
  const res = await f('https://x.supabase.co/functions/v1/agent-status', { method: 'POST', headers: { Authorization: 'Bearer old' }, body: '{}' });
  assertEquals(res.status, 200);
  assertEquals(auth, ['Bearer old', 'Bearer new-token']);
  assertEquals(expired, 0);
});

Deno.test('authFetch: no session to refresh → reported, the 401 is returned', async () => {
  const { fetch } = scriptedFetch([EXPIRED]);
  let expired = 0;
  const f = createAuthAwareFetch({ baseFetch: fetch, refresh: () => Promise.reject(new Error('refresh token revoked')), onExpired: () => expired++ });
  const res = await f('https://x.supabase.co/rest/v1/rpc/agent_dashboard', {});
  assertEquals(res.status, 401);
  assertEquals(expired, 1);
});

Deno.test('authFetch: other responses and auth endpoints are passed through', async () => {
  const { fetch, urls } = scriptedFetch([
    () => json(200, {}),
    () => json(401, { message: 'Missing authorization header' }),
    () => json(401, { message: 'Invalid JWT' }),
  ]);
  let refreshed = 0;
  const f = createAuthAwareFetch({ baseFetch: fetch, refresh: () => { refreshed++; return 't'; } });
  assertEquals((await f('https://x/rest/v1/a')).status, 200);
  assertEquals((await f('https://x/rest/v1/b')).status, 401);
  assertEquals((await f(new Request('https://x/auth/v1/token?grant_type=refresh_token'))).status, 401, 'never refreshes its own refresh');
  assertEquals(refreshed, 0);
  assertEquals(urls.length, 3);
});

Deno.test('authFetch: concurrent failures share one refresh', async () => {
  const { fetch } = scriptedFetch([EXPIRED, EXPIRED, () => json(200, {}), () => json(200, {})]);
  let refreshed = 0;
  const f = createAuthAwareFetch({
    baseFetch: fetch,
    refresh: async () => {
      refreshed++;
      await new Promise((r) => setTimeout(r, 5));
      return 'new';
    },
  });
  const [a, b] = await Promise.all([f('https://x/rest/v1/a'), f('https://x/rest/v1/b')]);
  assertEquals([a.status, b.status], [200, 200]);
  assertEquals(refreshed, 1);
});

Deno.test('connectSupabase: the client gets the auth-aware fetch, wired to refreshSession', async () => {
  let options;
  let session = { access_token: 'fresh' };
  const client = { auth: { refreshSession: () => Promise.resolve(session ? { data: { session }, error: null } : { data: {}, error: { message: 'no session' } }) } };
  const create = (_url, _key, opts) => {
    options = opts;
    return client;
  };
  const { fetch, auth } = scriptedFetch([EXPIRED, () => json(200, {}), EXPIRED]);
  connectSupabase({ url: 'https://x.supabase.co', anonKey: 'k' }, { create, baseFetch: fetch });
  assertEquals((await options.global.fetch('https://x/rest/v1/a', {})).status, 200);
  assertEquals(auth.at(-1), 'Bearer fresh');

  session = null;
  let fired = 0;
  const listener = () => fired++;
  globalThis.addEventListener(SESSION_EXPIRED_EVENT, listener);
  try {
    assertEquals((await options.global.fetch('https://x/rest/v1/a', {})).status, 401);
    assertEquals(fired, 1, 'the app is told the session is gone');
  } finally {
    globalThis.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  }
});

Deno.test('sessionExpiry: admin pages go to the login page and come back after signing in', async () => {
  const storage = new MemoryStorage();
  const went = [];
  const toasts = [];
  let signedOut = 0;
  const deps = { navigate: (p) => went.push(p), toast: (m) => toasts.push(m), signOut: () => { signedOut++; return Promise.reject(new Error('already expired')); }, storage };

  assertEquals(handleSessionExpired({ ...deps, path: '/admin/agents' }), true);
  await Promise.resolve();
  assertEquals(went, ['/admin/login']);
  assertEquals(toasts, [EXPIRED_MESSAGE]);
  assertEquals(signedOut, 1, 'a failed sign out does not stop the redirect');

  assertEquals(takeExpiredNotice(storage), true);
  assertEquals(takeExpiredNotice(storage), false, 'shown once');
  assertEquals(takeReturnPath(storage), '/admin/agents');
  assertEquals(takeReturnPath(storage), '/admin', 'forgotten once used');

  assertEquals(handleSessionExpired({ ...deps, path: '/' }), false, 'public pages are left alone');
  assertEquals(handleSessionExpired({ ...deps, path: '/admin/login' }), false);
  assertEquals(went.length, 1);
});

Deno.test('sessionExpiry: only admin paths are remembered; storage errors are ignored', () => {
  assertEquals([isAdminPath('/admin'), isAdminPath('/admin/doctype/1/edit'), isAdminPath('/administrator'), isAdminPath(null)], [true, true, false, false]);
  const storage = new MemoryStorage();
  rememberReturnPath('/history', storage);
  assertEquals(takeReturnPath(storage), '/admin');
  storage.setItem('ko-admin-return', 'https://evil.example');
  assertEquals(takeReturnPath(storage), '/admin', 'never leaves the admin pages');

  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  rememberReturnPath('/admin/agents', broken);
  assertEquals(takeReturnPath(broken), '/admin');
  assertEquals(takeExpiredNotice(broken), false);
  assertEquals(takeReturnPath(null), '/admin');
});

Deno.test('installSessionExpiryHandler: listens to the event until removed', () => {
  const target = new EventTarget();
  const went = [];
  let path = '/admin/categories';
  const stop = installSessionExpiryHandler({
    target, eventName: 'expired', currentPath: () => path, navigate: (p) => { went.push(p); path = p; }, signOut: () => {}, storage: new MemoryStorage(),
  });
  target.dispatchEvent(new Event('expired'));
  target.dispatchEvent(new Event('expired'));
  assertEquals(went, ['/admin/login'], 'already on the login page the second time');
  stop();
  path = '/admin';
  target.dispatchEvent(new Event('expired'));
  assertEquals(went.length, 1);
});
