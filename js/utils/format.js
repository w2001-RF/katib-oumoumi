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
  const day = parseInt(d, 10);
  const monthIdx = parseInt(m, 10) - 1;
  const month = MOROCCAN_MONTHS[monthIdx] || m;
  return `${day} ${month} ${y}`;
}

// Short version used in list rows, e.g. history cards: "02:13 · 3 غشت 2026"
export function formatDateTimeShort(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const day = d.getDate();
  const month = MOROCCAN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${hh}:${mm} · ${day} ${month} ${year}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Turn plain-text user input into safe HTML, preserving line breaks.
export function textToHtml(str) {
  return escapeHtml(str).replace(/\n/g, '<br/>');
}

export function slugifyKey(label) {
  return String(label).trim();
}

export function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
