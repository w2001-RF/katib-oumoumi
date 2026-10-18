// Expired admin sessions.
//
// supabase-js refreshes the access token (JWT) before it expires, but not
// while the tab sleeps or the laptop is closed: the next request then comes
// back 401 "JWT expired" (PostgREST) or "Invalid JWT" (Edge Functions with
// verify_jwt on, such as agent-status). This fetch, given to the Supabase
// client, refreshes the session once and replays the request; when the
// session cannot be refreshed (refresh token expired or revoked) it reports
// it, and the app sends the admin back to the login page (main.js).

// PGRST301 / PGRST303: PostgREST JWT errors. "Invalid JWT" / "JWT expired":
// the Edge Functions gateway. bad_jwt: Supabase Auth.
const EXPIRED_RE = /jwt expired|invalid jwt|token is expired|PGRST30[13]|bad_jwt/i;

/** Whether a 401 body says the access token is expired or invalid. */
export function isExpiredJwt(status, body) {
  return status === 401 && EXPIRED_RE.test(String(body ?? ''));
}

const urlOf = (input) => String(input?.url ?? input ?? '');

/**
 * A fetch that recovers from an expired JWT.
 * - `refresh()`: a new access token, or null when the session is gone;
 * - `onExpired()`: called when it is gone (the 401 response is still returned).
 * Concurrent failures share one refresh. Auth endpoints are left alone.
 */
export function createAuthAwareFetch({ baseFetch = globalThis.fetch, refresh, onExpired }) {
  let refreshing = null;
  const refreshOnce = () => {
    refreshing ??= Promise.resolve()
      .then(refresh)
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  return async (input, init = {}) => {
    const res = await baseFetch(input, init);
    if (res.status !== 401 || urlOf(input).includes('/auth/v1/')) return res;
    const body = await res.clone().text().catch(() => '');
    if (!isExpiredJwt(res.status, body)) return res;

    const token = await refreshOnce();
    if (!token) {
      onExpired?.();
      return res;
    }
    const headers = new Headers(init.headers ?? input?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return baseFetch(input, { ...init, headers });
  };
}
