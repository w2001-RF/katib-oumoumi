// Sends the admin back to the login page when the session expired (see
// js/authFetch.js), then back to the page they were on once signed in again.
// Public pages never use the admin session: they are left alone.

const RETURN_KEY = 'ko-admin-return';
const EXPIRED_KEY = 'ko-admin-expired';
const LOGIN_PATH = '/admin/login';

export const EXPIRED_MESSAGE = 'انتهت صلاحية الجلسة، سجّل الدخول من جديد.';

function sessionStore() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // storage blocked
  }
}

function safely(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function isAdminPath(path) {
  return typeof path === 'string' && (path === '/admin' || path.startsWith('/admin/')) && path !== LOGIN_PATH;
}

/** Remembers the admin page to come back to after signing in. */
export function rememberReturnPath(path, storage = sessionStore()) {
  if (isAdminPath(path)) safely(() => storage?.setItem(RETURN_KEY, path));
}

/** The admin page to open after signing in ('/admin' by default), forgotten once read. */
export function takeReturnPath(storage = sessionStore()) {
  const path = safely(() => storage?.getItem(RETURN_KEY));
  safely(() => storage?.removeItem(RETURN_KEY));
  return isAdminPath(path) ? path : '/admin';
}

/** Whether the login page was opened because the session expired (read once). */
export function takeExpiredNotice(storage = sessionStore()) {
  const expired = safely(() => storage?.getItem(EXPIRED_KEY)) === '1';
  safely(() => storage?.removeItem(EXPIRED_KEY));
  return expired;
}

/**
 * On an admin page: drops the dead session, remembers the page and opens the
 * login page. Returns whether it did (false on public pages and on the login page).
 */
export function handleSessionExpired({ path, signOut, navigate, toast, storage = sessionStore() }) {
  if (!isAdminPath(path)) return false;
  rememberReturnPath(path, storage);
  safely(() => storage?.setItem(EXPIRED_KEY, '1'));
  Promise.resolve()
    .then(signOut)
    .catch(() => { /* the token is already unusable: nothing to revoke */ });
  toast?.(EXPIRED_MESSAGE);
  navigate(LOGIN_PATH);
  return true;
}

/** Listens for `eventName` on `target` (window); returns the function that stops listening. */
export function installSessionExpiryHandler({ target = globalThis, eventName, currentPath, ...deps }) {
  const listener = () => handleSessionExpired({ ...deps, path: currentPath() });
  target.addEventListener(eventName, listener);
  return () => target.removeEventListener(eventName, listener);
}
