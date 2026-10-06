import { getCurrentSession } from '../api.js';
import { navigate } from '../router.js';
import { loadingSpinner } from '../ui.js';

export function requireAdmin(renderFn) {
  return async (container, params) => {
    container.innerHTML = loadingSpinner(true);
    let session;
    try {
      session = await getCurrentSession();
    } catch {
      session = null;
    }
    if (!session) {
      navigate('/admin/login');
      return;
    }
    return renderFn(container, params, session);
  };
}
