// Admin → AI agents dashboard: health, channels, models, tokens, cost,
// credits, failures and unavailability. Data: agent_dashboard() (migration 003)
// and the agent-status Edge Function. The HTML lives in agentSections.js.

import { icon } from '../utils/icons.js';
import { renderHeader, loadingSpinner, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { requireAdmin } from './adminGuard.js';
import {
  adminAgentDashboard, adminAgentStatus, adminDeleteModelPrice, adminSaveModelPrice, adminSaveProviderBudget,
} from '../api.js';
import { budgetFromForm, channelRows, loadErrorMessage, overallHealth, priceFromForm, RANGES, rangeFor } from './agentMetrics.js';
import {
  activitySection, budgetsSection, channelsSection, configSection, conversationsSection, failuresSection, healthBanner,
  kpiGrid, modelsSection, priceForm, pricesSection, reliabilitySection, usageSection,
} from './agentSections.js';

const REFRESH_MS = 60_000;
const RANGE_KEY = 'ko-agents-range';

function savedRange() {
  try {
    return localStorage.getItem(RANGE_KEY) || '7d';
  } catch {
    return '7d';
  }
}

function saveRange(key) {
  try {
    localStorage.setItem(RANGE_KEY, key);
  } catch { /* private mode: not remembered */ }
}

async function agentsView(container) {
  const app = document.getElementById('app');
  app?.classList.add('wide');
  const state = { range: savedRange(), dash: null, status: null, statusError: '', loading: false };

  container.innerHTML = `
    ${renderHeader({
      title: 'مراقبة الوكلاء الأذكياء',
      showBack: true,
      rightSlot: `<button class="icon-btn" id="refresh-btn" aria-label="تحديث">${icon('refresh')}</button>`,
    })}
    <main class="app-main dash">
      <div class="dash-toolbar">
        <div class="range-chips" role="group" aria-label="الفترة">
          ${Object.entries(RANGES).map(([k, r]) => `<button type="button" class="chip" data-range="${k}" aria-pressed="false">${r.label}</button>`).join('')}
        </div>
        <button type="button" class="btn-outline" id="probe-btn">${icon('checkCircle')} فحص مباشر</button>
      </div>
      <div id="dash-body">${loadingSpinner(true)}</div>
    </main>`;

  const body = container.querySelector('#dash-body');
  const probeBtn = container.querySelector('#probe-btn');

  function markRange() {
    container.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === state.range)));
  }

  function render() {
    const now = new Date();
    if (!state.dash) return;
    const { dash, status } = state;
    body.innerHTML = [
      healthBanner(overallHealth(dash, status, now), {
        generatedAt: dash.generated_at, lastTurnAt: dash.last_turn_at, statusError: state.statusError, now,
      }),
      kpiGrid(dash),
      channelsSection(channelRows(dash, status), now),
      activitySection(dash),
      modelsSection(dash, status, now),
      usageSection(dash),
      budgetsSection(dash, status, now),
      reliabilitySection(dash, now),
      conversationsSection(dash),
      failuresSection(dash, now),
      pricesSection(dash),
      configSection(status, state.statusError),
    ].join('');
  }

  async function loadStatus(probe = false) {
    try {
      state.status = await adminAgentStatus({ probe });
      state.statusError = '';
    } catch (e) {
      state.statusError = e?.message?.includes('Failed to send') || e?.name === 'FunctionsFetchError'
        ? 'دالة agent-status غير منشورة أو غير متاحة'
        : String(e?.message ?? e);
    }
  }

  async function load({ withStatus = false, probe = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    const { from, to } = rangeFor(state.range);
    try {
      const [dash] = await Promise.all([adminAgentDashboard({ from, to }), withStatus ? loadStatus(probe) : null]);
      state.dash = dash;
      render();
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><p>${loadErrorMessage(e)}</p></div>`;
    } finally {
      state.loading = false;
    }
  }

  async function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      if (form.dataset.form === 'price') await adminSaveModelPrice(priceFromForm(values));
      else await adminSaveProviderBudget(budgetFromForm(values));
      showToast('تم الحفظ');
      await load();
    } catch (err) {
      showToast(err?.message || 'تعذر الحفظ');
    }
  }

  async function onClick(e) {
    const range = e.target.closest('[data-range]');
    if (range) {
      state.range = range.dataset.range;
      saveRange(state.range);
      markRange();
      body.innerHTML = loadingSpinner(true);
      return load();
    }
    const edit = e.target.closest('[data-edit-price]');
    if (edit) {
      const slot = container.querySelector('#price-form-slot');
      slot.innerHTML = priceForm(JSON.parse(edit.dataset.editPrice));
      slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return undefined;
    }
    const del = e.target.closest('[data-del-price]');
    if (del && confirm(`حذف ثمن ${del.dataset.delPrice} · ${del.dataset.model}؟`)) {
      try {
        await adminDeleteModelPrice(del.dataset.delPrice, del.dataset.model);
        showToast('تم الحذف');
        await load();
      } catch {
        showToast('تعذر الحذف');
      }
    }
    return undefined;
  }

  container.querySelector('[data-action="back"]')?.addEventListener('click', () => navigate('/admin'));
  container.querySelector('#refresh-btn').addEventListener('click', () => load({ withStatus: true }));
  probeBtn.addEventListener('click', async () => {
    probeBtn.disabled = true;
    await load({ withStatus: true, probe: true });
    probeBtn.disabled = false;
    showToast(state.statusError ? 'تعذر الفحص المباشر' : 'تم الفحص');
  });
  container.addEventListener('click', onClick);
  container.addEventListener('submit', onSubmit);

  markRange();
  await load({ withStatus: true });
  const timer = setInterval(() => {
    if (!document.hidden) load();
  }, REFRESH_MS);

  return () => {
    clearInterval(timer);
    app?.classList.remove('wide');
  };
}

export const renderAdminAgents = requireAdmin(agentsView);
