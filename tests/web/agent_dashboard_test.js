import '../support/setup.js';
import { assert, assertEquals, assertRejects, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { argsOf, kind, sharedClient as db } from '../support/fakeSupabase.js';
import * as api from '../../js/api.js';
import * as m from '../../js/admin/agentMetrics.js';
import { hbars, lineChart, meter, niceMax, sparkline, stackedBars } from '../../js/admin/charts.js';
import * as s from '../../js/admin/agentSections.js';

const NOW = new Date('2026-10-16T12:00:00Z');
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

// A dashboard payload shaped like agent_dashboard() (see tests/sql/check_migrations.ts).
export function sampleDash(overrides = {}) {
  return {
    generated_at: ago(0),
    last_turn_at: ago(3),
    range: { from: ago(1440), to: ago(0), bucket: 'hour', tz: 'Africa/Casablanca' },
    kpis: {
      turns: 40, ok: 36, busy: 3, errors: 1, duplicates: 2, users: 12, documents: 9, voice_turns: 15, image_turns: 4,
      p50_ms: 3200, p95_ms: 14000, ai_calls: 120, ai_failures: 6, retries: 4, fallback_calls: 2, input_tokens: 250000,
      output_tokens: 12000, cost_usd: 0.42, new_users: 3, web_documents: 30,
    },
    previous: { turns: 20, ok: 20, users: 6, documents: 4, p95_ms: 9000, input_tokens: 100000, output_tokens: 5000, cost_usd: 0.2 },
    series: [
      { t: '2026-10-16T10:00', ok: 10, busy: 0, errors: 0, documents: 2, p50_ms: 3000, p95_ms: 9000, input_tokens: 9000, output_tokens: 400, cost_usd: 0.01 },
      { t: '2026-10-16T11:00', ok: 2, busy: 3, errors: 1, documents: 1, p50_ms: null, p95_ms: 30000, input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    ],
    channels: [{ channel: 'telegram', turns: 40, users: 12, documents: 9, busy: 3, errors: 1, duplicates: 2, voice_turns: 15, p50_ms: 3200, p95_ms: 14000 }],
    models: [
      { service: 'llm', provider: 'google', model: 'gemini-3.8-flash', roles: ['main', 'fast'], calls: 100, ok_calls: 96, retries: 4,
        rate_limited: 0, overloaded: 4, not_found: 0, timeouts: 0, auth_errors: 0, other_errors: 0, p50_ms: 1200, p95_ms: 4000,
        input_tokens: 240000, output_tokens: 11000, units: 0, cost_usd: 0.4, priced: true, last_ok_at: ago(4), last_error_at: ago(30),
        last_error_kind: 'overloaded', rate_limit: null },
      { service: 'llm', provider: 'groq', model: 'openai/gpt-oss-120b', roles: ['fallback'], calls: 3, ok_calls: 1, retries: 0,
        rate_limited: 2, overloaded: 0, not_found: 0, timeouts: 0, auth_errors: 0, other_errors: 0, p50_ms: 800, p95_ms: 900,
        input_tokens: 9000, output_tokens: 1000, units: 0, cost_usd: 0, priced: false, last_ok_at: ago(60), last_error_at: ago(5),
        last_error_kind: 'rate_limit', rate_limit: { at: ago(5), limit_requests: 1000, remaining_requests: 0, limit_tokens: 8000, remaining_tokens: 7000 } },
      { service: 'stt', provider: 'groq', model: 'whisper-large-v3', roles: [], calls: 15, ok_calls: 15, units: 240, cost_usd: 0.02, priced: true },
      { service: 'channel', provider: 'telegram', model: '', calls: 80, ok_calls: 80 },
    ],
    tasks: [{ service: 'llm', task: 'extraction', calls: 50, failures: 2, avg_ms: 1500, p95_ms: 4000, input_tokens: 150000, output_tokens: 5000, cost_usd: 0.3 }],
    errors: [{ service: 'llm', error_kind: 'overloaded', count: 4 }, { service: 'llm', error_kind: 'rate_limit', count: 2 }],
    outages: [
      { service: 'agent', provider: 'telegram', model: '', started_at: ago(70), ended_at: ago(65), minutes: 5, failures: 3, kinds: ['busy'] },
      { service: 'llm', provider: 'groq', model: 'openai/gpt-oss-120b', started_at: ago(10), ended_at: ago(5), minutes: 5, failures: 2, kinds: ['rate_limit'] },
    ],
    funnel: { started: 14, with_document: 12, reached_confirmation: 10, done: 9, cancelled: 2, in_progress: 1, abandoned: 2, median_minutes_to_done: 6.5, avg_turns_to_done: 7.2 },
    documents: [{ document_type_id: 'd1', name_ar: 'شكاية بسبب الجار', agent: 5, web: 12 }],
    users: { total: 20, consented: 18, voice: 7, new: 3, by_channel: { telegram: 20 } },
    budgets: [{ provider: 'google', monthly_budget_usd: 5, prepaid_credit_usd: null, credit_since: null, daily_request_limit: 1500,
      daily_token_limit: null, notes: '', configured: true, month_start: '2026-10-01T00:00:00Z', month_spent_usd: 2.4, month_requests: 900,
      credit_spent_usd: null, today_requests: 300, today_tokens: 50000 }],
    pricing: { prices: [{ provider: 'google', model: '*', input_usd_per_mtok: 0.5, output_usd_per_mtok: 2, usd_per_audio_minute: 0, usd_per_mchar: 0, notes: 'paid' }],
      unpriced: [{ service: 'llm', provider: 'groq', model: 'openai/gpt-oss-120b' }] },
    failures: {
      calls: [{ at: ago(5), channel: 'telegram', service: 'llm', provider: 'groq', model: 'openai/gpt-oss-120b', role: 'fallback', task: 'extraction',
        attempt: 1, http_status: 429, error_kind: 'rate_limit', error: '<script>alert(1)</script>', latency_ms: 300 }],
      turns: [{ at: ago(6), channel: 'telegram', outcome: 'busy', input_kind: 'voice', state_before: 'collecting', error: 'HTTP 503', latency_ms: 61000 }],
    },
    ...overrides,
  };
}

export function sampleStatus(overrides = {}) {
  return {
    checkedAt: ago(0),
    ai: {
      roles: [{ role: 'main', provider: 'google', host: 'generativelanguage.googleapis.com', model: 'gemini-3.8-flash', hasKey: true, own: true,
        caps: { tools: true, json: 'schema', vision: true, audioInput: true } },
      { role: 'fallback', provider: 'groq', host: 'api.groq.com', model: 'openai/gpt-oss-120b', hasKey: false, own: true,
        caps: { tools: false, json: 'none', vision: false, audioInput: false } }],
      stt: { mode: 'endpoint', provider: 'groq', model: 'whisper-large-v3' }, tts: { configured: false }, retries: 2, timeoutMs: 45000,
    },
    pdf: { configured: false, fallback: 'html' },
    metrics: 'on',
    channels: {
      telegram: { configured: true, secretSet: true, reachable: true, latencyMs: 120, bot: { username: 'katib_bot' },
        webhook: { set: true, host: 'p.supabase.co', pendingUpdates: 0, lastErrorAt: null, lastError: null } },
      whatsapp: { configured: false, implemented: false },
    },
    probes: [
      { provider: 'google', ok: true, latencyMs: 210, models: { 'gemini-3.8-flash': true } },
      { provider: 'groq', ok: false, status: 401, errorKind: 'auth' },
    ],
    credits: [{ provider: 'openrouter', ok: true, limitUsd: 10, usageUsd: 2, remainingUsd: 8 }],
    ...overrides,
  };
}

Deno.test('ranges and formatting', () => {
  const r = m.rangeFor('24h', NOW);
  assertEquals([r.key, r.to, r.from.toISOString()], ['24h', NOW, '2026-10-15T12:00:00.000Z']);
  assertEquals(m.rangeFor('bogus', NOW).key, '7d');
  assertEquals([m.formatCount(1234.4), m.formatCount(null), m.formatCount('x')], ['1,234', '—', '—']);
  assertEquals([5, 1500, 2_000_000, 3e9, null].map(m.formatCompact), ['5', '1.5k', '2M', '3B', '—']);
  assertEquals([0, 0.0042, 3.456, 1234.5, undefined].map(m.formatUsd), ['$0', '$0.0042', '$3.46', '$1,235', '—']);
  assertEquals([350, 2500, 90_000, null].map(m.formatMs), ['350 ms', '2.5 s', '1.5 min', '—']);
  assertEquals([m.formatPercent(0.9), m.formatPercent(0.123, 1), m.formatPercent(null)], ['90%', '12.3%', '—']);
  assertEquals([m.ratio(1, 4), m.ratio(1, 0), m.ratio(null, 2)], [0.25, null, null]);
  assertEquals([30, 125, 3000, null].map(m.formatMinutes), ['30 د', '2 س 5 د', '2 ي 2 س', '—']);
  assertEquals([ago(0.5), ago(5), ago(180), ago(3000), null, 'nope'].map((t) => m.timeAgo(t, NOW)),
    ['الآن', 'قبل 5 د', 'قبل 3 س', 'قبل 2 ي', '—', '—']);
  assertEquals([m.bucketLabel('2026-10-16T14:00', 'hour'), m.bucketLabel('2026-10-16T00:00', 'day')], ['14:00', '16/10']);
  assertEquals(m.labelOf(m.TASK_LABELS, 'extraction'), 'استخراج المعلومات');
  assertEquals([m.labelOf(m.TASK_LABELS, 'new-task'), m.labelOf({}, null)], ['new-task', '—']);
});

Deno.test('deltas: direction and tone', () => {
  assertEquals(m.delta(12, 10), { text: '+20%', tone: 'good' });
  assertEquals(m.delta(12, 10, { invert: true }), { text: '+20%', tone: 'bad' });
  assertEquals(m.delta(8, 10, { invert: true }), { text: '−20%', tone: 'good' });
  assertEquals(m.delta(10, 10), { text: '=', tone: 'neutral' });
  assertEquals(m.delta(3, 0), { text: 'جديد', tone: 'neutral' });
  assertEquals([m.delta(0, 0), m.delta(null, 3), m.delta(3, undefined)], [null, null, null]);
});

Deno.test('model health, capacity and outages', () => {
  const [gemini, groq] = sampleDash().models;
  assertEquals([m.modelLevel(gemini, NOW), m.modelLevel(groq, NOW), m.modelLevel({ calls: 0 }, NOW)], ['ok', 'down', 'idle']);
  assertEquals(m.modelLevel({ ...groq, last_error_at: ago(60), last_ok_at: ago(90) }, NOW), 'degraded', 'old errors, low availability');
  assertEquals(m.availability(gemini), 0.96);
  assertEquals(m.capacityOf(groq.rate_limit), {
    requests: { remaining: 0, limit: 1000, pct: 0 }, tokens: { remaining: 7000, limit: 8000, pct: 0.875 }, at: groq.rate_limit.at,
  });
  assertEquals(m.capacityOf({ remaining_requests: 5 }).requests, { remaining: 5, limit: null, pct: null });
  assertEquals([m.capacityOf(null), m.capacityOf({})], [null, null]);
  const outages = sampleDash().outages;
  assertEquals(m.outageMinutes([...outages, outages[1]]), { 'agent|telegram|': 5, 'llm|groq|openai/gpt-oss-120b': 10 });
  assertEquals(outages.map((o) => m.isOngoing(o, NOW)), [false, true]);
  assertEquals(m.isOngoing(null, NOW), false);
});

Deno.test('budgets: month spend, projection, credit and daily quotas', () => {
  const v = m.budgetView(sampleDash().budgets[0], NOW);
  assertEquals([v.spent, v.budget, v.budgetPct, v.level], [2.4, 5, 0.48, 'ok']);
  assert(Math.abs(v.projected - 4.8) < 1e-9, `15.5 days elapsed of 31: ${v.projected}`);
  assertEquals(v.requests, { used: 300, limit: 1500, pct: 0.2 });
  assertEquals([v.tokens, v.credit], [null, null]);
  const over = m.budgetView({ provider: 'x', monthly_budget_usd: 1, month_spent_usd: 1.5, prepaid_credit_usd: 10, credit_spent_usd: 4 }, NOW);
  assertEquals([over.level, over.credit.remaining, over.credit.pct, over.projectedOver], ['over', 6, 0.4, true]);
  assertEquals(m.budgetView({ provider: 'x', monthly_budget_usd: 1, month_spent_usd: 0.85 }, NOW).level, 'warn');
  assertEquals(m.budgetView({ provider: 'x' }, NOW).level, 'none');
});

Deno.test('channels: configuration merged with activity', () => {
  const rows = m.channelRows(sampleDash(), sampleStatus());
  assertEquals(rows.map((r) => [r.channel, r.configured, m.channelLevel(r, NOW)]), [
    ['telegram', true, 'ok'], ['whatsapp', false, 'idle'], ['web', true, 'ok'],
  ]);
  assertEquals(rows[2].webDocuments, 30);
  const tg = (live, stats = null) => m.channelLevel({ channel: 'telegram', configured: live?.configured ?? true, live, stats }, NOW);
  assertEquals(tg({ configured: false }), 'down');
  assertEquals(tg({ configured: true, reachable: false }), 'down');
  assertEquals(tg({ configured: true, webhook: { set: false } }), 'down');
  assertEquals(tg({ configured: true, webhook: { set: true, lastErrorAt: ago(10) } }), 'degraded');
  assertEquals(tg({ configured: true, webhook: { set: true, pendingUpdates: 50 } }), 'degraded');
  assertEquals(tg(null, { turns: 10, busy: 3, errors: 0 }), 'degraded');
  assertEquals(tg(null, null), 'unknown');
  assertEquals(m.channelLevel({ channel: 'whatsapp', implemented: true, configured: true, live: { configured: true } }, NOW), 'ok');
  assertEquals(m.channelRows(null, null).map((r) => r.configured), [null, null, true]);
});

Deno.test('overall health: reasons, worst first', () => {
  const h = m.overallHealth(sampleDash(), sampleStatus(), NOW);
  assertEquals(h.level, 'degraded');
  const texts = h.reasons.map((r) => r.text).join(' | ');
  assertStringIncludes(texts, 'openai/gpt-oss-120b', 'ongoing fallback outage');
  assertStringIncludes(texts, 'فحص groq فشل');
  assertStringIncludes(texts, 'لم تنجح', 'last hour: 4 of 6 messages failed');

  const down = m.overallHealth(sampleDash({ models: [{ ...sampleDash().models[1], auth_errors: 1, not_found: 1 }] }),
    sampleStatus({ channels: { telegram: { configured: false } }, probes: [{ provider: 'google', ok: true, models: { gone: false } }] }), NOW);
  assertEquals(down.level, 'down');
  assertEquals(down.reasons[0].level, 'down');
  assertStringIncludes(down.reasons.map((r) => r.text).join(' '), '404');
  assertStringIncludes(down.reasons.map((r) => r.text).join(' '), 'gone');

  const tgIssues = m.overallHealth(null, sampleStatus({
    ai: { roles: [] },
    channels: { telegram: { configured: true, reachable: false, error: 'x', webhook: { set: false, lastErrorAt: ago(5), lastError: 'boom', pendingUpdates: 40 } } },
    probes: [],
  }), NOW);
  assertEquals(tgIssues.reasons.length, 5);

  const quiet = m.overallHealth(sampleDash({ kpis: { turns: 0 }, series: [], models: [], outages: [], budgets: [] }), sampleStatus({ probes: [] }), NOW);
  assertEquals(quiet, { level: 'idle', reasons: [] });
  assertEquals(m.overallHealth(null, null, NOW).level, 'unknown');

  const money = m.overallHealth(sampleDash({ series: [], outages: [], models: [], budgets: [
    { provider: 'a', monthly_budget_usd: 1, month_spent_usd: 2 },
    { provider: 'b', prepaid_credit_usd: 1, credit_spent_usd: 1, month_spent_usd: 1 },
    { provider: 'c', daily_request_limit: 10, today_requests: 10 },
  ] }), null, NOW);
  assertEquals(money.reasons.length, 3);
});

Deno.test('forms: prices and budgets are validated', () => {
  assertEquals(m.parseOptionalNumber(''), null);
  assertEquals(m.parseOptionalNumber('0,5'), 0.5);
  assert(Number.isNaN(m.parseOptionalNumber('-1')));
  assertEquals(m.priceFromForm({ provider: ' Google ', model: '', input_usd_per_mtok: '0.3', output_usd_per_mtok: '2.5' }), {
    provider: 'google', model: '*', notes: '', input_usd_per_mtok: 0.3, output_usd_per_mtok: 2.5, usd_per_audio_minute: 0, usd_per_mchar: 0,
  });
  assertThrows(() => m.priceFromForm({ provider: '' }), Error, 'المزود');
  assertThrows(() => m.priceFromForm({ provider: 'g', input_usd_per_mtok: 'abc' }), Error, 'أرقاماً');
  assertEquals(m.budgetFromForm({ provider: 'groq', monthly_budget_usd: '', daily_request_limit: '1000.4', credit_since: '2026-10-01' }), {
    provider: 'groq', notes: '', monthly_budget_usd: null, prepaid_credit_usd: null, daily_request_limit: 1000, daily_token_limit: null,
    credit_since: '2026-10-01',
  });
  assertThrows(() => m.budgetFromForm({}), Error, 'المزود');
  assertThrows(() => m.budgetFromForm({ provider: 'g', daily_token_limit: 'x' }), Error);
  assertThrows(() => m.budgetFromForm({ provider: 'g', credit_since: '16/10/2026' }), Error, 'تاريخ');
});

Deno.test('load errors are explained', () => {
  assertStringIncludes(m.loadErrorMessage({ code: 'PGRST202', message: 'Could not find the function public.agent_dashboard' }), '003');
  assertStringIncludes(m.loadErrorMessage({ code: '42501', message: 'agent_dashboard: admin only' }), '003',
    'the function name wins: a missing function is the likelier cause');
  assertStringIncludes(m.loadErrorMessage({ message: 'permission denied for table' }), 'للمسؤول');
  assertStringIncludes(m.loadErrorMessage(new TypeError('Failed to fetch')), 'الشبكة');
  assertStringIncludes(m.loadErrorMessage('boom'), 'boom');
});

Deno.test('charts: SVG markup, empty states, escaping', () => {
  assertEquals([niceMax(0), niceMax(7), niceMax(12), niceMax(0.3), niceMax(1000)], [1, 10, 20, 0.5, 1000]);
  const pts = [{ label: '10:00', values: { a: 2, b: 1 } }, { label: '<b>', values: { a: 0, b: 3 } }];
  const bars = stackedBars(pts, [{ key: 'a', label: 'A', cls: 'ok' }, { key: 'b', label: 'B', cls: 'error' }], { label: 'x' });
  assertEquals((bars.match(/<rect/g) ?? []).length, 3, 'zero values draw nothing');
  assertStringIncludes(bars, '&lt;b&gt;');
  assert(!bars.includes('<b>'));
  assertStringIncludes(stackedBars([], [], {}), 'لا توجد بيانات');
  assertStringIncludes(stackedBars([{ label: 'a', values: { a: 0 } }], [{ key: 'a', label: 'A', cls: 'ok' }]), 'لا توجد بيانات');

  const line = lineChart([{ label: '1', values: { v: 1 } }, { label: '2', values: { v: null } }, { label: '3', values: { v: 3 } }],
    [{ key: 'v', label: 'V', cls: 'gold' }]);
  assertEquals((line.match(/<polyline/g) ?? []).length, 2, 'a missing value breaks the line');
  assertStringIncludes(lineChart([{ label: '1', values: { v: null } }], [{ key: 'v', label: 'V', cls: 'gold' }]), 'لا توجد بيانات');

  assertStringIncludes(sparkline([1, 3, 2]), '<polyline');
  assertEquals([sparkline([1]), sparkline([0, 0])], ['', '']);
  assertStringIncludes(meter(0.5), 'width:50%');
  assertStringIncludes(meter(0.9), 'meter-warn');
  assertStringIncludes(meter(1.7), 'width:100%');
  assertStringIncludes(meter(1.7), 'meter-over');
  assertEquals([meter(null), meter('x')], ['', '']);
  assertStringIncludes(hbars([{ label: '<x>', value: 3 }, { label: 'y', value: 0, cls: 'error' }]), '&lt;x&gt;');
  assertStringIncludes(hbars([]), 'لا شيء');
});

Deno.test('dashboard sections render every block and escape provider text', () => {
  const dash = sampleDash();
  const status = sampleStatus();
  const html = [
    s.healthBanner(m.overallHealth(dash, status, NOW), { generatedAt: dash.generated_at, lastTurnAt: dash.last_turn_at, statusError: '<i>', now: NOW }),
    s.kpiGrid(dash),
    s.channelsSection(m.channelRows(dash, status), NOW),
    s.activitySection(dash),
    s.modelsSection(dash, status, NOW),
    s.usageSection(dash),
    s.budgetsSection(dash, status, NOW),
    s.reliabilitySection(dash, NOW),
    s.conversationsSection(dash),
    s.failuresSection(dash, NOW),
    s.pricesSection(dash),
    s.configSection(status),
  ].join('\n');
  for (const id of ['channels', 'activity', 'models', 'usage', 'budgets', 'reliability', 'conversations', 'failures', 'prices', 'config']) {
    assertStringIncludes(html, `id="${id}"`);
  }
  assert(!html.includes('<script>'), 'error text from providers is escaped');
  assert(!html.includes('<i>'));
  assertStringIncludes(html, '&lt;script&gt;');
  assertStringIncludes(html, '@katib_bot');
  assertStringIncludes(html, 'gemini-3.8-flash');
  assertStringIncludes(html, 'بدون ثمن', 'unpriced model');
  assertStringIncludes(html, 'data-form="price"');
  assertStringIncludes(html, 'data-form="budget"');
  assertStringIncludes(html, 'رصيد OpenRouter', 'live credit');
  assertStringIncludes(html, 'غير متصل بعد', 'WhatsApp is not connected yet');
  assertStringIncludes(html, "4 د صوت", "speech-to-text usage in minutes");
});

Deno.test('sections cope with missing data and alternative configurations', () => {
  const empty = {};
  const html = [
    s.kpiGrid(empty), s.activitySection(empty), s.modelsSection(empty, null), s.usageSection(empty), s.budgetsSection(empty, null),
    s.reliabilitySection(empty), s.conversationsSection(empty), s.failuresSection(empty), s.pricesSection(empty),
    s.channelsSection(m.channelRows(null, null)), s.configSection(null, 'not deployed'),
  ].join('');
  assertStringIncludes(html, 'لم يُستدعَ أي نموذج');
  assertStringIncludes(html, 'agent-status');
  assertStringIncludes(html, 'not deployed');

  const status = sampleStatus({
    ai: { roles: [{ role: 'vision', provider: 'p', host: 'h', model: 'x', hasKey: true, own: false, caps: { json: 'none' } }],
      stt: { mode: 'main-model', model: 'gemini' }, tts: { configured: true, model: 'kokoro', provider: 'self' }, retries: 0, timeoutMs: 1000 },
    pdf: { configured: true, host: 'pdf.local' }, metrics: 'off',
  });
  const cfg = s.configSection(status);
  for (const text of ['يرث الرئيسي', 'يسمع الصوت', 'kokoro', 'pdf.local', 'AGENT_METRICS=off']) assertStringIncludes(cfg, text);
  assertStringIncludes(s.configSection(sampleStatus({ ai: { roles: [], stt: { mode: 'none' }, tts: {} } })), 'الرسائل الصوتية لا تعمل');

  const tg = s.channelsSection([{ channel: 'telegram', configured: true, live: { configured: true, secretSet: false, webhook: { set: false } }, stats: null },
    { channel: 'whatsapp', implemented: true, stats: { turns: 1 } }], NOW);
  assertStringIncludes(tg, 'غير مسجل');
  assertStringIncludes(tg, 'غير مضبوط');
  assertStringIncludes(s.channelsSection([{ channel: 'telegram', live: { configured: false } }], NOW), 'TELEGRAM_BOT_TOKEN');

  const budget = s.budgetsSection({ budgets: [{ provider: 'x', monthly_budget_usd: 1, month_spent_usd: 2, prepaid_credit_usd: 5, credit_spent_usd: 1 }] }, null, NOW);
  assertStringIncludes(budget, 'الرصيد: باقي $4.00');
  const models = s.modelsSection({ models: [{ service: 'llm', provider: 'google', model: 'gone', calls: 1, ok_calls: 0 }] },
    { probes: [{ provider: 'google', ok: true, models: { gone: false } }] }, NOW);
  assertStringIncludes(models, 'غير مدرج');
  assertStringIncludes(s.table(['a'], [[null]]), '—');
});

Deno.test('API: dashboard RPC, status function, prices and budgets', async () => {
  db.reset((call) => ({ data: call.rpc ? { kpis: {} } : call.fn ? { ai: {} } : null, error: null }));
  const from = new Date('2026-10-15T00:00:00Z');
  const to = new Date('2026-10-16T00:00:00Z');
  assertEquals(await api.adminAgentDashboard({ from, to }), { kpis: {} });
  assertEquals(db.calls.at(-1).args, { p_from: from.toISOString(), p_to: to.toISOString(), p_tz: 'Africa/Casablanca' });
  assertEquals(await api.adminAgentStatus({ probe: true }), { ai: {} });
  assertEquals([db.calls.at(-1).fn, db.calls.at(-1).options], ['agent-status', { body: { probe: true } }]);
  await api.adminAgentStatus();
  assertEquals(db.calls.at(-1).options, { body: { probe: false } });

  await api.adminSaveModelPrice({ provider: 'google', model: '*' });
  assertEquals([kind(db.calls.at(-1)), db.calls.at(-1).table, argsOf(db.calls.at(-1), 'upsert')[1]], ['upsert', 'agent_model_prices', { onConflict: 'provider,model' }]);
  await api.adminDeleteModelPrice('google', '*');
  assertEquals(db.calls.at(-1).ops.filter(([op]) => op === 'eq'), [['eq', 'provider', 'google'], ['eq', 'model', '*']]);
  await api.adminSaveProviderBudget({ provider: 'groq' });
  assertEquals(argsOf(db.calls.at(-1), 'upsert')[1], { onConflict: 'provider' });

  db.reset(() => ({ data: null, error: { message: 'boom' } }));
  for (const fn of [() => api.adminAgentDashboard({ from, to }), () => api.adminAgentStatus(), () => api.adminSaveModelPrice({}),
    () => api.adminDeleteModelPrice('a', 'b'), () => api.adminSaveProviderBudget({})]) {
    await assertRejects(fn);
  }
});
