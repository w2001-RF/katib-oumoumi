// HTML of each block of the AI agents dashboard, as pure functions of the
// data (agent_dashboard() + agent-status). Every value that comes from the
// database or a provider is escaped. Event wiring lives in adminAgents.js.

import { escapeHtml as esc } from '../utils/format.js';
import {
  availability, bucketLabel, budgetView, capacityOf, CHANNEL_LABELS, channelLevel, delta, ERROR_LABELS, formatCompact,
  formatCount, formatMinutes, formatMs, formatPercent, formatUsd, isOngoing, labelOf, LEVEL_LABELS, modelLevel,
  OUTCOME_LABELS, outageMinutes, ratio, ROLE_LABELS, SERVICE_LABELS, successRate, TASK_LABELS, timeAgo,
} from './agentMetrics.js';
import { hbars, lineChart, meter, sparkline, stackedBars } from './charts.js';

// --- building blocks -------------------------------------------------------------

export function pill(level, text = LEVEL_LABELS[level] ?? level) {
  return `<span class="pill pill-${esc(level)}"><span class="dot"></span>${esc(text)}</span>`;
}

export function section(id, title, body, { note = '', actions = '' } = {}) {
  return `<section class="dash-card" id="${esc(id)}" aria-labelledby="${esc(id)}-title">
    <div class="dash-card-head"><h2 id="${esc(id)}-title">${esc(title)}</h2>${actions}</div>
    ${note ? `<p class="small-note">${note}</p>` : ''}
    ${body}
  </section>`;
}

const numClass = (isNum) => (isNum ? 'num' : '');

function headerCell(h) {
  if (typeof h === 'string') return `<th>${esc(h)}</th>`;
  return `<th class="${numClass(h.num)}">${esc(h.label)}</th>`;
}

function tableRow(cells, numeric) {
  const tds = cells.map((c, i) => `<td class="${numClass(numeric[i])}">${c ?? '—'}</td>`).join('');
  return `<tr>${tds}</tr>`;
}

/** headers: [label | {label, num}], rows: array of cell arrays (cells are already-safe HTML). */
export function table(headers, rows, { empty = 'لا توجد بيانات في هذه الفترة.' } = {}) {
  if (!rows.length) return `<p class="small-note">${esc(empty)}</p>`;
  const head = headers.map(headerCell).join('');
  const numeric = headers.map((h) => typeof h !== 'string' && h.num);
  const body = rows.map((r) => tableRow(r, numeric)).join('');
  return `<div class="table-wrap"><table class="dash-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** [[label, safe html value], ...] as a definition list. */
function kvList(items) {
  const rows = items.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  return `<dl class="kv">${rows}</dl>`;
}

const reasonItem = (r) => `<li>${pill(r.level, '')}${esc(r.text)}</li>`;

function deltaBadge(d) {
  return d ? `<span class="delta delta-${d.tone}">${esc(d.text)}</span>` : '';
}

function kpi({ label, value, d, spark = '', hint = '' }) {
  return `<div class="kpi">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value"><span class="v">${esc(value)}</span> ${deltaBadge(d)}</div>
    ${spark}
    ${hint ? `<div class="kpi-hint">${esc(hint)}</div>` : ''}
  </div>`;
}

const seriesOf = (dash, key) => (dash?.series ?? []).map((p) => p[key]);
const points = (dash, keys) =>
  (dash?.series ?? []).map((p) => ({ label: bucketLabel(p.t, dash.range?.bucket), values: Object.fromEntries(keys.map((k) => [k, p[k]])) }));

// --- 1. health ---------------------------------------------------------------------

export function healthBanner(health, { generatedAt, lastTurnAt, statusError, now = new Date() } = {}) {
  const items = health.reasons.map(reasonItem).join('');
  const reasons = items ? `<ul class="health-reasons">${items}</ul>` : '';
  const meta = [
    `آخر رسالة: ${timeAgo(lastTurnAt, now)}`,
    generatedAt ? `حُدّثت البيانات ${timeAgo(generatedAt, now)}` : '',
    statusError ? `الحالة المباشرة غير متاحة: ${statusError}` : '',
  ].filter(Boolean).map(esc).join(' · ');
  return `<div class="health health-${esc(health.level)}" role="status">
    <div class="health-main">${pill(health.level)}<span class="health-meta">${meta}</span></div>
    ${reasons}
  </div>`;
}

// --- 2. KPIs -------------------------------------------------------------------------

export function kpiGrid(dash) {
  const k = dash?.kpis ?? {};
  const p = dash?.previous ?? {};
  const unavailable = (dash?.outages ?? []).filter((o) => o.service === 'agent').reduce((s, o) => s + (o.minutes ?? 0), 0);
  const tokens = (k.input_tokens ?? 0) + (k.output_tokens ?? 0);
  const prevTokens = (p.input_tokens ?? 0) + (p.output_tokens ?? 0);
  return `<div class="kpi-grid">
    ${kpi({ label: 'الرسائل المعالجة', value: formatCount(k.turns), d: delta(k.turns, p.turns),
      spark: sparkline(seriesOf(dash, 'ok')), hint: `${formatCount(k.voice_turns)} صوتية · ${formatCount(k.image_turns)} صور` })}
    ${kpi({ label: 'المستخدمون النشطون', value: formatCount(k.users), d: delta(k.users, p.users),
      hint: `${formatCount(k.new_users)} جدد` })}
    ${kpi({ label: 'الوثائق المولدة (الوكيل)', value: formatCount(k.documents), d: delta(k.documents, p.documents),
      spark: sparkline(seriesOf(dash, 'documents'), { cls: 'gold' }), hint: `+ ${formatCount(k.web_documents)} من تطبيق الويب` })}
    ${kpi({ label: 'نسبة النجاح', value: formatPercent(successRate(k)), d: delta(successRate(k), successRate(p)),
      hint: `${formatCount(k.busy)} «مشغول» · ${formatCount(k.errors)} خطأ` })}
    ${kpi({ label: 'زمن الرد (p95)', value: formatMs(k.p95_ms), d: delta(k.p95_ms, p.p95_ms, { invert: true }),
      spark: sparkline(seriesOf(dash, 'p95_ms'), { cls: 'gold' }), hint: `الوسيط ${formatMs(k.p50_ms)}` })}
    ${kpi({ label: 'التوكنات', value: formatCompact(tokens), d: delta(tokens, prevTokens, { invert: true }),
      spark: sparkline((dash?.series ?? []).map((s) => s.input_tokens + s.output_tokens)),
      hint: `دخل ${formatCompact(k.input_tokens)} · خرج ${formatCompact(k.output_tokens)}` })}
    ${kpi({ label: 'التكلفة التقديرية', value: formatUsd(k.cost_usd), d: delta(k.cost_usd, p.cost_usd, { invert: true }),
      hint: `${formatUsd(ratio(k.cost_usd, k.documents))} لكل وثيقة` })}
    ${kpi({ label: 'عدم التوفر للمستخدمين', value: formatMinutes(unavailable),
      hint: `${formatCount(k.ai_failures)} طلب فاشل · ${formatCount(k.retries)} إعادة · ${formatCount(k.fallback_calls)} احتياطي` })}
  </div>`;
}

// --- 3. channels ---------------------------------------------------------------------

function webhookText(w) {
  if (!w) return '—';
  return w.set ? `مسجل (${esc(w.host)})` : '<b class="txt-danger">غير مسجل</b>';
}

function telegramLive(live, now) {
  if (!live) return '<p class="small-note">الحالة المباشرة غير متاحة (دالة agent-status).</p>';
  if (!live.configured) return '<p class="small-note">غير مهيأ: TELEGRAM_BOT_TOKEN غير موجود.</p>';
  const w = live.webhook;
  const items = [
    ['البوت', live.bot ? `@${esc(live.bot.username)}` : '—'],
    ['Webhook', webhookText(w)],
    ['في الانتظار', w ? formatCount(w.pendingUpdates) : '—'],
    ['آخر خطأ توصيل', w?.lastErrorAt ? `${timeAgo(w.lastErrorAt, now)}: ${esc(w.lastError ?? '')}` : 'لا شيء'],
    ['السر (secret)', live.secretSet ? 'مضبوط' : '<b class="txt-danger">غير مضبوط</b>'],
    ['زمن الوصول', formatMs(live.latencyMs)],
  ];
  return kvList(items);
}

function channelStats(s) {
  if (!s) return '<p class="small-note">لا نشاط في هذه الفترة.</p>';
  const bad = (s.busy ?? 0) + (s.errors ?? 0);
  const items = [
    ['الرسائل', formatCount(s.turns)], ['المستخدمون', formatCount(s.users)], ['الوثائق', formatCount(s.documents)],
    ['الإخفاقات', `${formatCount(bad)} (${formatPercent(ratio(bad, s.turns))})`], ['p50 / p95', `${formatMs(s.p50_ms)} / ${formatMs(s.p95_ms)}`],
    ['الصوت', formatPercent(ratio(s.voice_turns, s.turns))], ['الرسائل المكررة', formatCount(s.duplicates)],
  ];
  return kvList(items);
}

export function channelsSection(rows, now = new Date()) {
  const cards = rows.map((row) => {
    let body;
    if (row.channel === 'telegram') body = telegramLive(row.live, now) + channelStats(row.stats);
    else if (row.channel === 'whatsapp') {
      body = row.implemented
        ? channelStats(row.stats)
        : '<p class="small-note">غير متصل بعد: محوّل واتساب (Meta Cloud API) لم يُنجز. سيظهر هنا تلقائياً بنفس المؤشرات.</p>';
    } else {
      body = `<dl class="kv"><dt>وثائق مولدة من المتصفح</dt><dd>${formatCount(row.webDocuments)}</dd></dl>
        <p class="small-note">التطبيق يولّد الوثائق في المتصفح بدون ذكاء اصطناعي.</p>`;
    }
    return `<div class="channel-card">
      <div class="channel-head"><strong>${esc(labelOf(CHANNEL_LABELS, row.channel))}</strong>${pill(channelLevel(row, now))}</div>
      ${body}
    </div>`;
  });
  return section('channels', 'القنوات', `<div class="channel-grid">${cards.join('')}</div>`);
}

// --- 4. activity ----------------------------------------------------------------------

export function activitySection(dash) {
  const bars = stackedBars(points(dash, ['ok', 'busy', 'errors']), [
    { key: 'ok', label: 'ناجحة', cls: 'ok' }, { key: 'busy', label: 'مشغول', cls: 'busy' }, { key: 'errors', label: 'خطأ', cls: 'error' },
  ], { label: 'الرسائل حسب النتيجة', formatY: formatCompact });
  const latency = lineChart(points(dash, ['p50_ms', 'p95_ms']), [
    { key: 'p50_ms', label: 'الوسيط', cls: 'navy' }, { key: 'p95_ms', label: 'p95', cls: 'gold' },
  ], { label: 'زمن الرد', formatY: formatMs });
  return section('activity', 'النشاط وزمن الرد', `<div class="chart-grid">
    <figure><figcaption>الرسائل حسب النتيجة ${legend([['ok', 'ناجحة'], ['busy', 'مشغول'], ['error', 'خطأ']])}</figcaption>${bars}</figure>
    <figure><figcaption>زمن الرد ${legend([['navy', 'الوسيط'], ['gold', 'p95']])}</figcaption>${latency}</figure>
  </div>`, { note: 'زمن الرد: من وصول الرسالة إلى آخر جواب (يشمل التحميل، النموذج، وPDF).' });
}

const legendItem = ([cls, l]) => `<span><i class="c-bg-${cls}"></i>${esc(l)}</span>`;

function legend(items) {
  return `<span class="legend">${items.map(legendItem).join('')}</span>`;
}

// --- 5. models & providers -----------------------------------------------------------------

function capacityCell(rl) {
  const cap = capacityOf(rl);
  if (!cap) return '<span class="small-note">لا يرسلها المزود</span>';
  const part = (name, c) => (c ? `<div>${name}: ${formatCompact(c.remaining)} / ${formatCompact(c.limit)}${meter(c.pct, { label: name })}</div>` : '');
  return part('طلبات', cap.requests) + part('توكنات', cap.tokens);
}

function probeCell(status, m) {
  const p = (status?.probes ?? []).find((x) => x.provider === m.provider && (m.model in (x.models ?? {}) || !x.models));
  if (!p) return '—';
  if (!p.ok) return `${pill('down', labelOf(ERROR_LABELS, p.errorKind))}`;
  const listed = p.models?.[m.model];
  if (listed === false) return pill('degraded', 'غير مدرج');
  return `${pill('ok', 'متاح')} ${formatMs(p.latencyMs)}`;
}

function modelCell(m) {
  const lastError = m.last_error_kind ? ` · آخر خطأ: ${esc(labelOf(ERROR_LABELS, m.last_error_kind))}` : '';
  const sub = `${esc(m.provider)} · ${esc(labelOf(SERVICE_LABELS, m.service))}${lastError}`;
  return `<b>${esc(m.model || m.provider)}</b><div class="small-note">${sub}</div>`;
}

function lastSeenCell(m, now) {
  if (!m.last_error_at) return timeAgo(m.last_ok_at, now);
  const kind = esc(labelOf(ERROR_LABELS, m.last_error_kind));
  return `${timeAgo(m.last_ok_at, now)}<div class="small-note" title="${kind}">خطأ ${timeAgo(m.last_error_at, now)}</div>`;
}

function withSubline(main, sub) {
  return sub ? `${esc(main)}<div class="small-note">${esc(sub)}</div>` : esc(main);
}

export function modelsSection(dash, status, now = new Date()) {
  const down = outageMinutes(dash?.outages);
  const rows = (dash?.models ?? []).filter((m) => m.service !== 'channel').map((m) => [
    modelCell(m),
    esc((m.roles ?? []).map((r) => labelOf(ROLE_LABELS, r)).join('، ') || '—'),
    pill(modelLevel(m, now)),
    formatPercent(availability(m)),
    formatCount(m.calls),
    `<span title="429 / 503-5xx / 404 / مهلة-شبكة / مفتاح / أخرى">${[m.rate_limited, m.overloaded, m.not_found, m.timeouts, m.auth_errors, m.other_errors].map(formatCount).join(' / ')}</span>`,
    formatCount(m.retries),
    `${formatMs(m.p50_ms)} / ${formatMs(m.p95_ms)}`,
    m.service === 'stt' ? `${formatMinutes((m.units ?? 0) / 60)} صوت` : `${formatCompact(m.input_tokens)} / ${formatCompact(m.output_tokens)}`,
    m.priced ? formatUsd(m.cost_usd) : '<span class="small-note">بدون ثمن</span>',
    capacityCell(m.rate_limit),
    formatMinutes(down[`${m.service}|${m.provider}|${m.model}`] ?? 0),
    lastSeenCell(m, now),
    probeCell(status, m),
  ]);
  return section('models', 'النماذج والمزودون', table([
    'النموذج', 'الدور', 'الحالة', { label: 'التوفر', num: true }, { label: 'الطلبات', num: true },
    { label: 'أخطاء 429/5xx/404/مهلة/مفتاح/أخرى', num: true }, { label: 'إعادات', num: true }, { label: 'p50 / p95', num: true },
    { label: 'التوكنات دخل/خرج', num: true }, { label: 'التكلفة', num: true }, 'السعة المتبقية', { label: 'عدم التوفر', num: true },
    'آخر نجاح', 'فحص مباشر',
  ], rows, { empty: 'لم يُستدعَ أي نموذج في هذه الفترة.' }), {
    note: 'كل محاولة محسوبة (حتى الإعادات). السعة من ترويسات x-ratelimit لآخر طلب. «فحص مباشر» يستدعي GET /models عند كل مزود.',
  });
}

// --- 6. tokens & cost -----------------------------------------------------------------

export function usageSection(dash) {
  const tokens = stackedBars(points(dash, ['input_tokens', 'output_tokens']), [
    { key: 'input_tokens', label: 'دخل', cls: 'navy' }, { key: 'output_tokens', label: 'خرج', cls: 'gold' },
  ], { label: 'التوكنات', formatY: formatCompact });
  const cost = lineChart(points(dash, ['cost_usd']), [{ key: 'cost_usd', label: 'التكلفة', cls: 'gold' }], { label: 'التكلفة', formatY: formatUsd });
  const rows = (dash?.tasks ?? []).map((t) => [
    esc(labelOf(TASK_LABELS, t.task)),
    formatCount(t.calls),
    `${formatCount(t.failures)} (${formatPercent(ratio(t.failures, t.calls))})`,
    formatMs(t.avg_ms), formatMs(t.p95_ms),
    formatCompact(t.input_tokens), formatCompact(t.output_tokens),
    formatCompact(ratio((t.input_tokens ?? 0) + (t.output_tokens ?? 0), t.calls)),
    formatUsd(t.cost_usd),
  ]);
  return section('usage', 'التوكنات والتكلفة', `<div class="chart-grid">
      <figure><figcaption>التوكنات ${legend([['navy', 'دخل'], ['gold', 'خرج']])}</figcaption>${tokens}</figure>
      <figure><figcaption>التكلفة التقديرية</figcaption>${cost}</figure>
    </div>
    <h3>حسب المهمة</h3>
    ${table(['المهمة', { label: 'الطلبات', num: true }, { label: 'الإخفاقات', num: true }, { label: 'المتوسط', num: true },
      { label: 'p95', num: true }, { label: 'دخل', num: true }, { label: 'خرج', num: true }, { label: 'توكن/طلب', num: true },
      { label: 'التكلفة', num: true }], rows)}`, {
    note: 'التكلفة محسوبة بالأثمنة الحالية في جدول «الأثمنة» أسفله (نماذج بدون ثمن = 0، مثل المستويات المجانية).',
  });
}

// --- 7. budgets & credits ----------------------------------------------------------------

function quotaLine(label, q) {
  if (!q) return '';
  return `<div class="quota"><span>${esc(label)}: ${formatCompact(q.used)} / ${formatCompact(q.limit)}</span>${meter(q.pct, { label })}</div>`;
}

const BUDGET_PILL = { none: 'ok', ok: 'ok', warn: 'degraded', over: 'down' };

function budgetCard(b, credit, now) {
  const v = budgetView(b, now);
  const budgetLine = v.budget === null
    ? '<div class="small-note">بدون ميزانية شهرية</div>'
    : `<div class="quota"><span>الشهر: ${formatUsd(v.spent)} / ${formatUsd(v.budget)}</span>${meter(v.budgetPct, { label: 'الميزانية' })}</div>`;
  const creditLine = v.credit
    ? `<div class="quota"><span>الرصيد: باقي ${formatUsd(v.credit.remaining)} من ${formatUsd(v.credit.total)}</span>${meter(v.credit.pct, { label: 'الرصيد' })}</div>`
    : '';
  const live = credit?.ok
    ? `<div class="quota"><span>رصيد OpenRouter (مباشر): باقي ${formatUsd(credit.remainingUsd)} · مستعمل ${formatUsd(credit.usageUsd)}</span>${meter(ratio(credit.usageUsd, credit.limitUsd), { label: 'OpenRouter' })}</div>`
    : '';
  return `<div class="budget-card">
    <div class="channel-head"><strong>${esc(b.provider)}</strong>${pill(BUDGET_PILL[v.level], v.budget === null ? 'بدون حد' : formatPercent(v.budgetPct, 0))}</div>
    ${budgetLine}${creditLine}${live}
    ${quotaLine('طلبات اليوم', v.requests)}${quotaLine('توكنات اليوم', v.tokens)}
    <dl class="kv"><dt>هذا الشهر</dt><dd>${formatUsd(v.spent)} · ${formatCount(v.monthRequests)} طلب</dd>
      <dt>التوقع لآخر الشهر</dt><dd class="${v.projectedOver ? 'txt-danger' : ''}">${formatUsd(v.projected)}</dd></dl>
    <details><summary>تعديل</summary>${budgetForm(b)}</details>
  </div>`;
}

const val = (v) => (v === null || v === undefined ? '' : esc(v));

export function budgetForm(b = {}) {
  return `<form class="dash-form" data-form="budget">
    <label>المزود<input name="provider" required value="${val(b.provider)}" ${b.provider ? 'readonly' : ''} placeholder="google"></label>
    <label>الميزانية الشهرية ($)<input name="monthly_budget_usd" inputmode="decimal" value="${val(b.monthly_budget_usd)}"></label>
    <label>رصيد مسبق الدفع ($)<input name="prepaid_credit_usd" inputmode="decimal" value="${val(b.prepaid_credit_usd)}"></label>
    <label>الرصيد منذ<input name="credit_since" type="date" value="${val(b.credit_since)}"></label>
    <label>حد الطلبات اليومي<input name="daily_request_limit" inputmode="numeric" value="${val(b.daily_request_limit)}"></label>
    <label>حد التوكنات اليومي<input name="daily_token_limit" inputmode="numeric" value="${val(b.daily_token_limit)}"></label>
    <label class="wide">ملاحظات<input name="notes" value="${val(b.notes)}"></label>
    <button class="btn-primary" type="submit">حفظ</button>
  </form>`;
}

export function budgetsSection(dash, status, now = new Date()) {
  const credits = Object.fromEntries((status?.credits ?? []).map((c) => [c.provider, c]));
  const cards = (dash?.budgets ?? []).map((b) => budgetCard(b, credits[b.provider], now));
  return section('budgets', 'الرصيد والميزانية والحصص', `<div class="channel-grid">${cards.join('') || '<p class="small-note">لا يوجد استهلاك هذا الشهر.</p>'}</div>
    <details class="add-block"><summary>إضافة ميزانية لمزود</summary>${budgetForm()}</details>`, {
    note: 'Google وGroq لا يوفّران واجهة للرصيد: أدخل الميزانية أو الحصة المجانية يدوياً (مثلاً حد الطلبات اليومي). رصيد OpenRouter يُقرأ مباشرة عند «فحص مباشر».',
  });
}

// --- 8. reliability ------------------------------------------------------------------------

export function reliabilitySection(dash, now = new Date()) {
  const errors = hbars((dash?.errors ?? []).map((e) => ({
    label: `${labelOf(ERROR_LABELS, e.error_kind)} · ${labelOf(SERVICE_LABELS, e.service)}`, value: e.count, cls: 'error',
  })), { formatValue: formatCount });
  const rows = (dash?.outages ?? []).map((o) => [
    isOngoing(o, now) ? pill('down', 'جارٍ') : pill('ok', 'انتهى'),
    esc(labelOf(SERVICE_LABELS, o.service)),
    withSubline(o.model || o.provider, o.model ? o.provider : ''),
    esc(new Date(o.started_at).toLocaleString('fr-MA')),
    formatMinutes(o.minutes),
    formatCount(o.failures),
    esc((o.kinds ?? []).map((k) => labelOf(ERROR_LABELS, k)).join('، ')),
  ]);
  return section('reliability', 'الإخفاقات وعدم التوفر', `<div class="chart-grid">
    <div><h3>الأخطاء حسب النوع</h3>${errors}</div>
    <div><h3>فترات عدم التوفر</h3>${table(['', 'الخدمة', 'المعني', 'البداية', { label: 'المدة', num: true },
      { label: 'الإخفاقات', num: true }, 'السبب'], rows, { empty: 'لا توجد فترات عدم توفر في هذه الفترة.' })}</div>
  </div>`, { note: 'فترة عدم التوفر: نافذة 5 دقائق فشلت فيها كل الطلبات (تقدير من الاستعمال الحقيقي). «الوكيل» = ما رآه المستخدم.' });
}

// --- 9. conversations ------------------------------------------------------------------------

export function conversationsSection(dash) {
  const f = dash?.funnel ?? {};
  const funnel = hbars([
    { label: 'محادثات بدأت', value: f.started ?? 0, cls: 'navy' },
    { label: 'تحددت الوثيقة', value: f.with_document ?? 0, cls: 'navy' },
    { label: 'وصلت للتأكيد', value: f.reached_confirmation ?? 0, cls: 'gold' },
    { label: 'وثيقة سُلّمت', value: f.done ?? 0, cls: 'ok' },
    { label: 'أُلغيت', value: f.cancelled ?? 0, cls: 'busy' },
    { label: 'مهجورة (+24 س)', value: f.abandoned ?? 0, cls: 'error' },
  ], { formatValue: formatCount });
  const u = dash?.users ?? {};
  const docs = (dash?.documents ?? []).map((d) => [esc(d.name_ar), formatCount(d.agent), formatCount(d.web)]);
  return section('conversations', 'المحادثات والوثائق', `<div class="chart-grid">
    <div><h3>مسار المحادثة</h3>${funnel}
      <dl class="kv"><dt>نسبة الإتمام</dt><dd>${formatPercent(ratio(f.done, f.started))}</dd>
        <dt>الوسيط حتى الوثيقة</dt><dd>${formatMinutes(f.median_minutes_to_done)}</dd>
        <dt>رسائل لكل وثيقة</dt><dd>${f.avg_turns_to_done ?? '—'}</dd><dt>جارية الآن</dt><dd>${formatCount(f.in_progress)}</dd></dl></div>
    <div><h3>المستخدمون</h3><dl class="kv"><dt>المجموع</dt><dd>${formatCount(u.total)}</dd><dt>وافقوا</dt><dd>${formatCount(u.consented)}</dd>
        <dt>يفضّلون الصوت</dt><dd>${formatCount(u.voice)} (${formatPercent(ratio(u.voice, u.total))})</dd><dt>جدد في الفترة</dt><dd>${formatCount(u.new)}</dd></dl>
      <h3>الوثائق الأكثر طلباً</h3>${table(['الوثيقة', { label: 'الوكيل', num: true }, { label: 'الويب', num: true }], docs)}</div>
  </div>`);
}

// --- 10. recent failures -----------------------------------------------------------------

export function failuresSection(dash, now = new Date()) {
  const calls = (dash?.failures?.calls ?? []).map((c) => [
    `<span title="${esc(c.at)}">${timeAgo(c.at, now)}</span>`,
    esc(labelOf(SERVICE_LABELS, c.service)),
    withSubline(c.model || c.provider, c.role ? labelOf(ROLE_LABELS, c.role) : ''),
    esc(labelOf(TASK_LABELS, c.task || c.operation)),
    c.attempt ? `#${formatCount(c.attempt + 1)}` : '1',
    esc(c.http_status ?? '—'),
    esc(labelOf(ERROR_LABELS, c.error_kind)),
    `<code class="err">${esc(c.error ?? '')}</code>`,
  ]);
  const turns = (dash?.failures?.turns ?? []).map((t) => [
    `<span title="${esc(t.at)}">${timeAgo(t.at, now)}</span>`, esc(labelOf(CHANNEL_LABELS, t.channel)),
    esc(labelOf(OUTCOME_LABELS, t.outcome)), esc(t.state_before ?? '—'), formatMs(t.latency_ms), `<code class="err">${esc(t.error ?? '')}</code>`,
  ]);
  return section('failures', 'آخر الإخفاقات', `<h3>طلبات فاشلة للخدمات</h3>
    ${table(['متى', 'الخدمة', 'النموذج', 'المهمة', 'المحاولة', 'HTTP', 'النوع', 'التفاصيل'], calls, { empty: 'لا توجد إخفاقات. 👌' })}
    <h3>رسائل لم تنجح (ما رآه المستخدم)</h3>
    ${table(['متى', 'القناة', 'النتيجة', 'المرحلة', 'الزمن', 'التفاصيل'], turns, { empty: 'كل الرسائل نجحت.' })}`, {
    note: 'لا تُسجَّل نصوص الرسائل ولا المعطيات الشخصية؛ المفاتيح وتوكن البوت تُحذف من رسائل الخطأ.',
  });
}

// --- 11. prices ------------------------------------------------------------------------------

export function priceForm(p = {}) {
  return `<form class="dash-form" data-form="price">
    <label>المزود<input name="provider" required value="${val(p.provider)}" placeholder="google"></label>
    <label>النموذج (* = الكل)<input name="model" value="${val(p.model)}" placeholder="*"></label>
    <label>دخل $/مليون توكن<input name="input_usd_per_mtok" inputmode="decimal" value="${val(p.input_usd_per_mtok)}"></label>
    <label>خرج $/مليون توكن<input name="output_usd_per_mtok" inputmode="decimal" value="${val(p.output_usd_per_mtok)}"></label>
    <label>$/دقيقة صوت (STT)<input name="usd_per_audio_minute" inputmode="decimal" value="${val(p.usd_per_audio_minute)}"></label>
    <label>$/مليون حرف (TTS)<input name="usd_per_mchar" inputmode="decimal" value="${val(p.usd_per_mchar)}"></label>
    <label class="wide">ملاحظات<input name="notes" value="${val(p.notes)}" placeholder="مثلاً: المستوى المجاني"></label>
    <button class="btn-primary" type="submit">حفظ الثمن</button>
  </form>`;
}

function unpricedChip(u) {
  const data = esc(JSON.stringify({ provider: u.provider, model: u.model }));
  return `<button class="chip" type="button" data-edit-price="${data}">${esc(u.provider)} · ${esc(u.model)}</button>`;
}

export function pricesSection(dash) {
  const pricing = dash?.pricing ?? { prices: [], unpriced: [] };
  const rows = pricing.prices.map((p) => [
    esc(p.provider), esc(p.model), formatUsd(p.input_usd_per_mtok), formatUsd(p.output_usd_per_mtok),
    formatUsd(p.usd_per_audio_minute), formatUsd(p.usd_per_mchar), esc(p.notes ?? ''),
    `<button class="link-btn" type="button" data-edit-price="${esc(JSON.stringify(p))}">تعديل</button>
     <button class="link-btn danger" type="button" data-del-price="${esc(p.provider)}" data-model="${esc(p.model)}">حذف</button>`,
  ]);
  const chips = pricing.unpriced.map(unpricedChip).join(' ');
  const unpriced = chips ? `<div class="notice">نماذج مستعملة بدون ثمن (تكلفتها محسوبة 0): ${chips}</div>` : '';
  return section('prices', 'الأثمنة', `${unpriced}
    ${table(['المزود', 'النموذج', { label: 'دخل/م', num: true }, { label: 'خرج/م', num: true }, { label: 'دقيقة صوت', num: true },
      { label: 'م حرف', num: true }, 'ملاحظات', ''], rows, { empty: 'لم يُضف أي ثمن بعد.' })}
    <div id="price-form-slot">${priceForm()}</div>`, {
    note: 'خذ الأثمنة من صفحة المزود. ثمن نموذج معيّن يغلب ثمن «*». تغيير الثمن يعيد حساب كل الفترات.',
  });
}

// --- 12. configuration -------------------------------------------------------------------------

function sttText(stt) {
  if (stt?.mode === 'endpoint') return `${esc(stt.model)} (${esc(stt.provider)})`;
  if (stt?.mode === 'main-model') return `النموذج الرئيسي يسمع الصوت (${esc(stt.model)})`;
  return '<span class="txt-danger">غير مهيأ: الرسائل الصوتية لا تعمل</span>';
}

function capsText(c) {
  return [c.vision && 'صور', c.audioInput && 'صوت', c.json !== 'none' && `JSON ${c.json}`, c.tools && 'أدوات'].filter(Boolean).join('، ') || '—';
}

export function configSection(status, statusError = '') {
  if (!status) {
    return section('config', 'الإعداد الحالي', `<p class="small-note">${esc(statusError || 'غير متاح')}. انشر الدالة: <code>npx supabase functions deploy agent-status --use-api</code></p>`);
  }
  const ai = status.ai ?? { roles: [] };
  const rows = ai.roles.map((r) => [
    esc(labelOf(ROLE_LABELS, r.role)), `<b>${esc(r.model)}</b>`, esc(r.provider), esc(r.host),
    r.own ? 'خاص' : 'يرث الرئيسي', r.hasKey ? 'موجود' : '<span class="small-note">بدون مفتاح</span>', esc(capsText(r.caps)),
  ]);
  const stt = sttText(ai.stt);
  const tts = ai.tts?.configured ? `${esc(ai.tts.model)} (${esc(ai.tts.provider)})` : 'غير مهيأ (ردود نصية فقط)';
  const pdf = status.pdf?.configured ? `Gotenberg (${esc(status.pdf.host)})` : 'غير مهيأ: يُرسل ملف HTML قابل للطباعة';
  return section('config', 'الإعداد الحالي', `${table(['الدور', 'النموذج', 'المزود', 'الخادم', 'الإعداد', 'المفتاح', 'القدرات'], rows,
    { empty: 'لا يوجد نموذج مهيأ.' })}
    <dl class="kv"><dt>تحويل الصوت إلى نص</dt><dd>${stt}</dd><dt>الرد الصوتي</dt><dd>${tts}</dd><dt>PDF</dt><dd>${pdf}</dd>
      <dt>الإعادات / المهلة</dt><dd>${formatCount(ai.retries)} / ${formatMs(ai.timeoutMs)}</dd>
      <dt>التسجيل (telemetry)</dt><dd>${status.metrics === 'off' ? 'متوقف (AGENT_METRICS=off)' : 'مفعّل'}</dd>
      <dt>آخر فحص</dt><dd>${esc(new Date(status.checkedAt).toLocaleString('fr-MA'))}</dd></dl>`, {
    note: 'لا تُعرض المفاتيح أبداً؛ فقط هل هي موجودة.',
  });
}
