// Moroccan (Maghrebi) Arabic month names — different from Mashriqi Arabic
// (e.g. غشت not أغسطس, دجنبر not ديسمبر). Matches how Moroccan admin
// documents are conventionally dated.
export const MOROCCAN_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو',
  'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر',
];

// Format an ISO date string (YYYY-MM-DD, as produced by <input type="date">)
// into "3 غشت 2026" style used across the app and the reference screenshots.
export function formatDateAr(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const day = Number.parseInt(d, 10);
  const monthIdx = Number.parseInt(m, 10) - 1;
  const month = MOROCCAN_MONTHS[monthIdx] || m;
  return `${day} ${month} ${y}`;
}

// Short version used in list rows, e.g. history cards: "02:13 · 3 غشت 2026"
export function formatDateTimeShort(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const day = d.getDate();
  const month = MOROCCAN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${hh}:${mm} · ${day} ${month} ${year}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Turn plain-text user input into safe HTML, preserving line breaks.
export function textToHtml(str) {
  return escapeHtml(str).replaceAll('\n', '<br/>');
}

export function slugifyKey(label) {
  return String(label).trim();
}

// randomUUID needs a secure context (HTTPS or localhost); getRandomValues
// works everywhere, so the fallback is just as unpredictable.
export function uid() {
  const { crypto } = globalThis;
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
