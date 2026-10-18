import { getCurrentSession } from '../api.js';
import { currentPath, navigate } from '../router.js';
import { loadingSpinner } from '../ui.js';
import { rememberReturnPath } from './sessionExpiry.js';

export function requireAdmin(renderFn) {
  return async (container, params) => {
    container.innerHTML = loadingSpinner(true);
    let session;
    try {
      // Refreshes an expired access token when the refresh token is still valid.
      session = await getCurrentSession();
    } catch {
      session = null;
    }
    if (!session) {
      rememberReturnPath(currentPath());
      navigate('/admin/login');
      return;
    }
    return renderFn(container, params, session);
  };
}
