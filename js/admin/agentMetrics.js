// Pure logic behind the AI agents dashboard (adminAgents.js): ranges,
// formatting, health rules, capacity and budget maths. No DOM, so it is
// unit-tested (tests/web/agent_dashboard_test.js).

export const RANGES = {
  '24h': { hours: 24, label: '24 ساعة' },
  '7d': { hours: 24 * 7, label: '7 أيام' },
  '30d': { hours: 24 * 30, label: '30 يوماً' },
  '90d': { hours: 24 * 90, label: '90 يوماً' },
};

export function rangeFor(key, now = new Date()) {
  const k = RANGES[key] ? key : '7d';
  return { key: k, label: RANGES[k].label, from: new Date(now.getTime() - RANGES[k].hours * 3_600_000), to: now };
}

export const CHANNEL_LABELS = { telegram: 'تيليغرام', whatsapp: 'واتساب', web: 'تطبيق الويب' };
export const SERVICE_LABELS = {
  llm: 'نموذج لغوي', stt: 'تحويل الصوت إلى نص', tts: 'تحويل النص إلى صوت', pdf: 'خدمة PDF', channel: 'منصة المراسلة', agent: 'الوكيل (ما رآه المستخدم)',
};
export const ROLE_LABELS = { main: 'رئيسي', vision: 'الصور', fast: 'سريع', fallback: 'احتياطي', stt: 'الصوت', tts: 'الرد الصوتي' };
export const TASK_LABELS = {
  intent: 'تحديد الوثيقة', extraction: 'استخراج المعلومات', question: 'صياغة السؤال', rewrite: 'الصياغة الإدارية',
  transcribe: 'تفريغ الصوت', speak: 'الرد الصوتي', render: 'توليد PDF', chat: 'محادثة',
};
export const ERROR_LABELS = {
  rate_limit: 'تجاوز الحد (429)', overloaded: 'ضغط على الخدمة (503)', server_error: 'خطأ في الخادم (5xx)',
  not_found: 'نموذج غير موجود (404)', timeout: 'انتهاء المهلة', network: 'تعذر الاتصال', auth: 'مفتاح مرفوض (401/403)',
  bad_request: 'طلب مرفوض (400)', empty_reply: 'جواب فارغ', other: 'أخرى', busy: 'رسالة «الخدمة مشغولة»', error: 'رسالة خطأ',
};
export const OUTCOME_LABELS = { ok: 'ناجحة', busy: 'الخدمة مشغولة', error: 'خطأ', duplicate: 'مكررة' };
export const LEVEL_LABELS = { ok: 'يعمل بشكل طبيعي', degraded: 'أداء متدهور', down: 'متوقف', idle: 'لا نشاط', unknown: 'غير معروف' };

export const labelOf = (map, key) => map[key] ?? key ?? '—';

/** Models served by Ollama run on your own hardware: no per-token price. */
export const isLocalProvider = (provider) => provider === 'ollama';

// --- formatting ------------------------------------------------------------------

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const num = (n) => (n === null || n === undefined || n === '' ? null : Number(n));

export function formatCount(n) {
  const v = num(n);
  return isNum(v) ? Math.round(v).toLocaleString('en-US') : '—';
}

export function formatCompact(n) {
  const v = num(n);
  if (!isNum(v)) return '—';
  const abs = Math.abs(v);
  const trim = (x) => x.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1e9) return `${trim(v / 1e9)}B`;
  if (abs >= 1e6) return `${trim(v / 1e6)}M`;
  if (abs >= 1e3) return `${trim(v / 1e3)}k`;
  return String(Math.round(v));
}

export function formatUsd(n) {
  const v = num(n);
  if (!isNum(v)) return '—';
  if (v === 0) return '$0';
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  if (Math.abs(v) < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export function formatMs(ms) {
  const v = num(ms);
  if (!isNum(v)) return '—';
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60_000) return `${(v / 1000).toFixed(1)} s`;
  return `${(v / 60_000).toFixed(1)} min`;
}

export function formatPercent(r, digits = 1) {
  const v = num(r);
  if (!isNum(v)) return '—';
  return `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function ratio(a, b) {
  const x = num(a);
  const y = num(b);
  return isNum(x) && isNum(y) && y > 0 ? x / y : null;
}

export function formatMinutes(min) {
  const v = num(min);
  if (!isNum(v)) return '—';
  if (v < 60) return `${Math.round(v)} د`;
  if (v < 1440) return `${Math.floor(v / 60)} س ${Math.round(v % 60)} د`;
  return `${Math.floor(v / 1440)} ي ${Math.floor((v % 1440) / 60)} س`;
}

export function timeAgo(iso, now = new Date()) {
  if (!iso) return '—';
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  return `قبل ${Math.floor(s / 86400)} ي`;
}

// "2026-10-16T14:00" bucket -> short axis label.
export function bucketLabel(t, bucket) {
  const [date, time] = String(t).split('T');
  const [, m, d] = date.split('-');
  return bucket === 'hour' ? (time ?? '').slice(0, 5) : `${d}/${m}`;
}

/** Change vs the previous period. `invert`: a rise is bad (errors, latency, cost). */
export function delta(current, previous, { invert = false } = {}) {
  const c = num(current);
  const p = num(previous);
  if (!isNum(c) || !isNum(p)) return null;
  if (p === 0) return c === 0 ? null : { text: 'جديد', tone: 'neutral' };
  const pct = (c - p) / p;
  if (Math.abs(pct) < 0.005) return { text: '=', tone: 'neutral' };
  const up = pct > 0;
  return { text: `${up ? '+' : '−'}${Math.abs(pct * 100).toFixed(0)}%`, tone: up === invert ? 'bad' : 'good' };
}

// --- derived rows ---------------------------------------------------------------------

export function successRate(k) {
  return ratio(num(k?.ok) ?? 0, num(k?.turns) ?? 0);
}

export function availability(row) {
  return ratio(row?.ok_calls, row?.calls);
}

/** Model health from its calls: down when its last calls failed recently. */
export function modelLevel(row, now = new Date()) {
  if (!row?.calls) return 'idle';
  const lastOk = row.last_ok_at ? new Date(row.last_ok_at).getTime() : 0;
  const lastErr = row.last_error_at ? new Date(row.last_error_at).getTime() : 0;
  if (lastErr > lastOk && now.getTime() - lastErr < 15 * 60_000) return 'down';
  const a = availability(row);
  if (a !== null && a < 0.95) return 'degraded';
  return 'ok';
}

/** Remaining capacity from the provider's last rate-limit headers. */
export function capacityOf(rl) {
  if (!rl) return null;
  const part = (remaining, limit) => {
    const r = num(remaining);
    const l = num(limit);
    if (!isNum(r) && !isNum(l)) return null;
    return { remaining: r, limit: l, pct: isNum(r) && isNum(l) && l > 0 ? r / l : null };
  };
  const requests = part(rl.remaining_requests, rl.limit_requests);
  const tokens = part(rl.remaining_tokens, rl.limit_tokens);
  return requests || tokens ? { requests, tokens, at: rl.at ?? null } : null;
}

function levelFor(pctUsed) {
  if (pctUsed === null) return 'none';
  if (pctUsed >= 1) return 'over';
  if (pctUsed >= 0.8) return 'warn';
  return 'ok';
}

/** Budget, credit and daily quota use for one provider row of agent_dash_budgets. */
export function budgetView(b, now = new Date()) {
  const spent = num(b.month_spent_usd) ?? 0;
  const budget = num(b.monthly_budget_usd);
  const monthStart = b.month_start ? new Date(b.month_start) : new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max((now.getTime() - monthStart.getTime()) / 86_400_000, 1 / 24);
  const projected = (spent / elapsedDays) * daysInMonth;
  const budgetPct = budget ? spent / budget : null;
  const credit = num(b.prepaid_credit_usd);
  const creditSpent = num(b.credit_spent_usd) ?? spent;
  const quota = (used, limit) => {
    const l = num(limit);
    return l ? { used: num(used) ?? 0, limit: l, pct: (num(used) ?? 0) / l } : null;
  };
  return {
    provider: b.provider,
    spent,
    budget,
    budgetPct,
    level: levelFor(budgetPct),
    projected,
    projectedOver: budget ? projected > budget : false,
    credit: credit === null ? null : { total: credit, spent: creditSpent, remaining: credit - creditSpent, pct: credit ? creditSpent / credit : null },
    requests: quota(b.today_requests, b.daily_request_limit),
    tokens: quota(b.today_tokens, b.daily_token_limit),
    monthRequests: num(b.month_requests) ?? 0,
  };
}

/** Minutes of estimated unavailability per "service|provider|model". */
export function outageMinutes(outages = []) {
  const totals = {};
  for (const o of outages) {
    const key = `${o.service}|${o.provider}|${o.model ?? ''}`;
    totals[key] = (totals[key] ?? 0) + (num(o.minutes) ?? 0);
  }
  return totals;
}

export function isOngoing(outage, now = new Date()) {
  return !!outage?.ended_at && now.getTime() - new Date(outage.ended_at).getTime() < 10 * 60_000;
}

/** One row per channel: what is configured (agent-status) and what happened (dashboard). */
export function channelRows(dash, status) {
  const stats = Object.fromEntries((dash?.channels ?? []).map((c) => [c.channel, c]));
  const tg = status?.channels?.telegram;
  const wa = status?.channels?.whatsapp;
  return [
    { channel: 'telegram', stats: stats.telegram ?? null, configured: tg ? !!tg.configured : null, live: tg ?? null },
    { channel: 'whatsapp', stats: stats.whatsapp ?? null, configured: wa ? !!wa.configured : null, implemented: wa?.implemented ?? false, live: wa ?? null },
    { channel: 'web', stats: stats.web ?? null, configured: true, webDocuments: dash?.kpis?.web_documents ?? 0 },
  ];
}

// What Telegram's own webhook report says; null when it shows no problem.
function liveLevel(live, now) {
  if (!live) return null;
  if (live.reachable === false) return 'down';
  const w = live.webhook;
  if (w && !w.set) return 'down';
  const lastErr = w?.lastErrorAt ? new Date(w.lastErrorAt).getTime() : 0;
  if (lastErr && now.getTime() - lastErr < 3_600_000) return 'degraded';
  if ((w?.pendingUpdates ?? 0) > 20) return 'degraded';
  return null;
}

function trafficLevel(s) {
  if (!s || s.turns < 3) return null;
  return ratio((s.busy ?? 0) + (s.errors ?? 0), s.turns) > 0.2 ? 'degraded' : null;
}

export function channelLevel(row, now = new Date()) {
  if (row.channel === 'web') return 'ok';
  if (row.channel === 'whatsapp' && !row.implemented) return 'idle';
  if (row.configured === false) return 'down';
  const level = liveLevel(row.live, now) ?? trafficLevel(row.stats);
  if (level) return level;
  return !row.live && !row.stats ? 'unknown' : 'ok';
}

const RANK = { ok: 0, idle: 0, unknown: 1, degraded: 2, down: 3 };

function worst(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

function telegramReasons(tg, now) {
  if (!tg) return [];
  if (!tg.configured) return [['down', 'بوت تيليغرام غير مهيأ (TELEGRAM_BOT_TOKEN)']];
  const reasons = [];
  if (tg.reachable === false) reasons.push(['down', `تعذر الوصول إلى تيليغرام: ${tg.error ?? ''}`]);
  if (tg.webhook && !tg.webhook.set) reasons.push(['down', 'الـ Webhook ديال تيليغرام غير مسجل']);
  const lastErr = tg.webhook?.lastErrorAt ? new Date(tg.webhook.lastErrorAt).getTime() : 0;
  if (lastErr && now.getTime() - lastErr < 3_600_000) {
    reasons.push(['degraded', `تيليغرام لم يتمكن من إيصال رسالة ${timeAgo(tg.webhook.lastErrorAt, now)}: ${tg.webhook.lastError ?? ''}`]);
  }
  if ((tg.webhook?.pendingUpdates ?? 0) > 20) reasons.push(['degraded', `${tg.webhook.pendingUpdates} رسالة في الانتظار عند تيليغرام`]);
  return reasons;
}

function modelReasons(dash, now) {
  const reasons = [];
  const llmOutages = (dash?.outages ?? []).filter((o) => o.service === 'llm' && isOngoing(o, now));
  const llmModels = (dash?.models ?? []).filter((m) => m.service === 'llm');
  if (llmOutages.length) {
    const allDown = llmModels.length > 0 && llmModels.every((m) => modelLevel(m, now) === 'down');
    const names = [...new Set(llmOutages.map((o) => o.model || o.provider))].join('، ');
    reasons.push([allDown ? 'down' : 'degraded', `النموذج لا يجيب حالياً: ${names}`]);
  }
  for (const m of dash?.models ?? []) {
    if (m.not_found > 0 && modelLevel(m, now) === 'down') reasons.push(['degraded', `النموذج ${m.model} غير موجود (404): قد يكون أُوقف، غيّر LLM_*MODEL`]);
    if (m.auth_errors > 0 && modelLevel(m, now) === 'down') reasons.push(['down', `مفتاح ${m.provider} مرفوض (401/403)`]);
  }
  return reasons;
}

function probeReasons(status) {
  const reasons = [];
  for (const p of status?.probes ?? []) {
    if (!p.ok) reasons.push(['degraded', `فحص ${p.provider} فشل: ${labelOf(ERROR_LABELS, p.errorKind)}`]);
    for (const [model, listedNow] of Object.entries(p.models ?? {})) {
      if (listedNow !== false) continue;
      const fix = p.provider === 'ollama' ? `: نفّذ ollama pull ${model} على ${p.host}` : '';
      reasons.push(['degraded', `${model} غير موجود في لائحة نماذج ${p.provider}${fix}`]);
    }
  }
  return reasons;
}

function trafficReasons(dash) {
  const last = (dash?.series ?? []).findLast((p) => p.ok + p.busy + p.errors > 0);
  if (!last) return [];
  const total = last.ok + last.busy + last.errors;
  const bad = ratio(last.busy + last.errors, total);
  return total >= 3 && bad > 0.2 ? [['degraded', `${formatPercent(bad, 0)} من الرسائل الأخيرة لم تنجح`]] : [];
}

function budgetReasons(dash, now) {
  return (dash?.budgets ?? []).map((b) => budgetView(b, now)).flatMap((v) => {
    if (v.level === 'over') return [['degraded', `تجاوز ميزانية ${v.provider} الشهرية`]];
    if (v.credit && v.credit.remaining <= 0) return [['degraded', `نفد رصيد ${v.provider}`]];
    if (v.requests && v.requests.pct >= 1) return [['degraded', `استُنفدت حصة ${v.provider} اليومية من الطلبات`]];
    return [];
  });
}

/** Overall state and the reasons behind it, worst first. */
export function overallHealth(dash, status, now = new Date()) {
  if (!dash && !status) return { level: 'unknown', reasons: [] };
  const found = [
    ...telegramReasons(status?.channels?.telegram, now),
    ...modelReasons(dash, now),
    ...probeReasons(status),
    ...trafficReasons(dash),
    ...budgetReasons(dash, now),
  ];
  if (status && !(status.ai?.roles ?? []).length) found.push(['down', 'لا يوجد نموذج مهيأ (LLM_BASE_URL / LLM_MODEL)']);
  let level = found.reduce((acc, [lvl]) => worst(acc, lvl), 'ok');
  if (level === 'ok' && dash && (dash.kpis?.turns ?? 0) <= 0) level = 'idle';
  const reasons = found.toSorted((a, b) => RANK[b[0]] - RANK[a[0]]).map(([lvl, text]) => ({ level: lvl, text }));
  return { level, reasons };
}

/** '' -> null, a number -> number, anything else -> NaN (invalid input). */
export function parseOptionalNumber(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

/** A price row from the form; throws a message in Arabic when invalid. */
export function priceFromForm(f) {
  const provider = String(f.provider ?? '').trim().toLowerCase();
  const model = String(f.model ?? '').trim() || '*';
  if (!provider) throw new Error('المزود مطلوب');
  const fields = ['input_usd_per_mtok', 'output_usd_per_mtok', 'usd_per_audio_minute', 'usd_per_mchar'];
  const row = { provider, model, notes: String(f.notes ?? '').trim() };
  for (const k of fields) {
    const v = parseOptionalNumber(f[k]);
    if (Number.isNaN(v)) throw new Error('الأثمنة يجب أن تكون أرقاماً موجبة');
    row[k] = v ?? 0;
  }
  return row;
}

/** Same limit as the agent_settings check constraint (migration 004). */
export const SYSTEM_PROMPT_MAX = 4000;

/** The system prompt from the form, trimmed; throws a message in Arabic when too long. */
export function systemPromptFromForm(f) {
  const value = String(f.system_prompt ?? '').replaceAll('\r\n', '\n').trim();
  if (value.length > SYSTEM_PROMPT_MAX) throw new Error(`التعليمات طويلة جداً (${value.length} / ${SYSTEM_PROMPT_MAX} حرف)`);
  return value;
}

/** Why the bot settings could not be read, in Arabic. */
export function settingsLoadError(e) {
  const text = `${e?.code ?? ''} ${e?.message ?? e ?? ''}`;
  if (/agent_settings|does not exist|PGRST205|42P01/i.test(text)) return 'جدول إعدادات البوت غير موجود بعد';
  return loadErrorMessage(e);
}

/** A budget row from the form; throws a message in Arabic when invalid. */
export function budgetFromForm(f) {
  const provider = String(f.provider ?? '').trim().toLowerCase();
  if (!provider) throw new Error('المزود مطلوب');
  const row = { provider, notes: String(f.notes ?? '').trim() };
  for (const k of ['monthly_budget_usd', 'prepaid_credit_usd', 'daily_request_limit', 'daily_token_limit']) {
    const v = parseOptionalNumber(f[k]);
    if (Number.isNaN(v)) throw new Error('القيم يجب أن تكون أرقاماً موجبة');
    row[k] = k.startsWith('daily') && v !== null ? Math.round(v) : v;
  }
  const since = String(f.credit_since ?? '').trim();
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('تاريخ غير صالح');
  row.credit_since = since || null;
  return row;
}

/** Explains a failed dashboard load (most often: migration 003 not applied yet). */
export function loadErrorMessage(e) {
  const text = `${e?.code ?? ''} ${e?.message ?? e ?? ''}`;
  if (/PGRST202|agent_dashboard|does not exist|Could not find the function/i.test(text)) {
    return 'جداول المراقبة غير موجودة بعد: نفّذ supabase/migrations/003_agent_dashboard.sql في SQL Editor ثم أعد النشر.';
  }
  if (/42501|admin only|permission denied/i.test(text)) return 'هذه الصفحة للمسؤول فقط: سجّل الدخول من جديد.';
  if (/Failed to fetch|NetworkError|ERR_/i.test(text)) return 'تعذر الاتصال بـ Supabase. تحقق من الشبكة.';
  return `تعذر تحميل البيانات: ${e?.message ?? e}`;
}
