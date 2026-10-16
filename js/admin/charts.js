// Tiny SVG charts for the admin dashboard, returned as markup strings: no
// library, no build step. Colours come from CSS classes (.c-<cls>), and every
// bar or point carries a <title> so hovering (or a screen reader) gives the value.

import { escapeHtml } from '../utils/format.js';

const W = 640;
const PAD = { top: 10, right: 8, bottom: 22, left: 44 };

/** Smallest 1/2/5 × 10^n at or above `v` (axis maximum). */
export function niceMax(v) {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v);
}

const f1 = (n) => Math.round(n * 10) / 10;

function axis(max, height, formatY) {
  const inner = height - PAD.top - PAD.bottom;
  return [0, 0.5, 1].map((t) => {
    const y = f1(PAD.top + inner * (1 - t));
    return `<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y}" y2="${y}"/>` +
      `<text class="axis" x="${PAD.left - 6}" y="${f1(y + 4)}" text-anchor="end">${escapeHtml(formatY(max * t))}</text>`;
  }).join('');
}

function xLabels(labels, step, x, y) {
  const every = Math.max(1, Math.ceil(labels.length / 8));
  return labels
    .map((l, i) => (i % every === 0 ? `<text class="axis" x="${f1(x(i) + step / 2)}" y="${y}" text-anchor="middle">${escapeHtml(l)}</text>` : ''))
    .join('');
}

function frame(height, label, body) {
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeHtml(label)}" preserveAspectRatio="none">${body}</svg>`;
}

function empty(height, label) {
  return frame(height, label, `<text class="axis" x="${W / 2}" y="${height / 2}" text-anchor="middle">لا توجد بيانات في هذه الفترة</text>`);
}

const tooltip = (at, series, value) => [at, ' · ', series, ': ', value].join('');
const point = ([a, b]) => [f1(a), f1(b)].join(',');

/**
 * Stacked bars. points: [{ label, values: { key: number } }];
 * series: [{ key, label, cls }] stacked bottom-up in that order.
 */
export function stackedBars(points, series, { height = 180, label = '', formatY = String } = {}) {
  const totals = points.map((p) => series.reduce((s, sr) => s + (Number(p.values[sr.key]) || 0), 0));
  if (!points.length || !totals.some((t) => t > 0)) return empty(height, label);
  const max = niceMax(Math.max(...totals));
  const inner = height - PAD.top - PAD.bottom;
  const step = (W - PAD.left - PAD.right) / points.length;
  const x = (i) => PAD.left + i * step;
  const barW = Math.max(1, step * 0.72);
  const bars = points.map((p, i) => {
    let base = 0;
    return series.map((sr) => {
      const v = Number(p.values[sr.key]) || 0;
      if (!v) return '';
      const h = (v / max) * inner;
      const y = PAD.top + inner - base - h;
      base += h;
      const tip = escapeHtml(tooltip(p.label, sr.label, formatY(v)));
      return `<rect class="c-${sr.cls}" x="${f1(x(i) + (step - barW) / 2)}" y="${f1(y)}" width="${f1(barW)}" height="${f1(h)}">` +
        `<title>${tip}</title></rect>`;
    }).join('');
  }).join('');
  const labels = xLabels(points.map((p) => p.label), step, x, height - 6);
  return frame(height, label, axis(max, height, formatY) + bars + labels);
}

/** Lines over the same x axis. Missing values (null) break the line. */
export function lineChart(points, series, { height = 160, label = '', formatY = String } = {}) {
  const values = points.flatMap((p) => series.map((s) => p.values[s.key])).filter((v) => v !== null && v !== undefined);
  if (!points.length || !values.length) return empty(height, label);
  const max = niceMax(Math.max(...values.map(Number)));
  const inner = height - PAD.top - PAD.bottom;
  const step = (W - PAD.left - PAD.right) / points.length;
  const x = (i) => PAD.left + i * step + step / 2;
  const y = (v) => PAD.top + inner - (Number(v) / max) * inner;
  const lines = series.map((s) => {
    const segments = [];
    let current = [];
    points.forEach((p, i) => {
      const v = p.values[s.key];
      if (v === null || v === undefined) {
        if (current.length) segments.push(current);
        current = [];
      } else current.push([x(i), y(v), p.label, v]);
    });
    if (current.length) segments.push(current);
    const paths = segments.map((seg) => {
      const pts = seg.map(point).join(' ');
      return `<polyline class="l-${s.cls}" fill="none" points="${pts}"/>`;
    });
    const dots = segments.flat().map(([a, b, l, v]) => {
      const tip = escapeHtml(tooltip(l, s.label, formatY(v)));
      return `<circle class="c-${s.cls}" cx="${f1(a)}" cy="${f1(b)}" r="2.5"><title>${tip}</title></circle>`;
    });
    return paths.join('') + dots.join('');
  }).join('');
  const labels = xLabels(points.map((p) => p.label), step, (i) => PAD.left + i * step, height - 6);
  return frame(height, label, axis(max, height, formatY) + lines + labels);
}

/** A small trend line for KPI cards. */
export function sparkline(values, { cls = 'navy', width = 96, height = 26 } = {}) {
  const nums = values.map((v) => Number(v) || 0);
  if (nums.length < 2 || !nums.some((v) => v > 0)) return '';
  const max = Math.max(...nums);
  const pts = nums.map((v, i) => `${f1((i / (nums.length - 1)) * width)},${f1(height - 2 - (v / max) * (height - 4))}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none"><polyline class="l-${cls}" fill="none" points="${pts}"/></svg>`;
}

/** A horizontal gauge, 0..1 (values above 1 are shown full, in the "over" colour). */
export function meter(pct, { label = '' } = {}) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return '';
  const p = Math.max(0, Number(pct));
  let level = 'ok';
  if (p >= 1) level = 'over';
  else if (p >= 0.8) level = 'warn';
  const width = Math.min(100, Math.round(p * 100));
  return `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}" aria-label="${escapeHtml(label)}">` +
    `<span class="meter-${level}" style="width:${width}%"></span></div>`;
}

/** Horizontal bars for a ranked list: [{ label, value, cls? }]. */
export function hbars(items, { formatValue = String } = {}) {
  if (!items.length) return '<p class="small-note">لا شيء في هذه الفترة.</p>';
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  const row = (i) => {
    const width = Math.max(2, Math.round(((Number(i.value) || 0) / max) * 100));
    return `<li><span class="hb-label">${escapeHtml(i.label)}</span>` +
      `<span class="hb-track"><span class="hb-bar c-bg-${i.cls ?? 'navy'}" style="width:${width}%"></span></span>` +
      `<span class="hb-value">${escapeHtml(formatValue(i.value))}</span></li>`;
  };
  return `<ul class="hbars">${items.map(row).join('')}</ul>`;
}
