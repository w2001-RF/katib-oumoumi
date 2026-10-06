import { icon } from '../utils/icons.js';
import { renderHeader, attachHeaderBack, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { adminSignIn, getCurrentSession } from '../api.js';

export async function renderAdminLogin(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'دخول المسؤول', showBack: true })}
    <main class="app-main">
      <div class="login-wrap">
        <div class="logo">${icon('lock')}<div style="margin-top:10px;">لوحة تحكم كاتب عمومي</div></div>
        <form id="login-form">
          <div class="field">
            <label>البريد الإلكتروني</label>
            <input type="email" name="email" required autocomplete="username" />
          </div>
          <div class="field">
            <label>كلمة المرور</label>
            <input type="password" name="password" required autocomplete="current-password" />
          </div>
          <p class="error-msg" id="login-error" hidden></p>
          <button type="submit" class="btn-primary" id="login-btn">تسجيل الدخول</button>
        </form>
        <p class="small-note" style="text-align:center;margin-top:16px;">
          يقتصر الدخول على حساب المسؤول الوحيد للتطبيق.
        </p>
      </div>
    </main>
  `;
  attachHeaderBack(container, '/settings');

  try {
    const session = await getCurrentSession();
    if (session) {
      navigate('/admin');
      return;
    }
  } catch { /* Supabase not configured yet — let the form show the error on submit */ }

  const form = container.querySelector('#login-form');
  const btn = container.querySelector('#login-btn');
  const errEl = container.querySelector('#login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> جارٍ الدخول...`;
    const email = form.email.value.trim();
    const password = form.password.value;
    try {
      await adminSignIn(email, password);
      navigate('/admin');
    } catch (err) {
      errEl.textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      errEl.hidden = false;
      btn.disabled = false;
      btn.innerHTML = 'تسجيل الدخول';
    }
  });
}
