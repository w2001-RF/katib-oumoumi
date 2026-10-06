import { uid } from './utils/format.js';

const KEY = 'ko_history';
const MAX_ITEMS = 50;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

// entry: { documentTypeId, documentTypeName, data }
export function addHistoryEntry(entry) {
  const items = readAll();
  const record = {
    id: uid(),
    documentTypeId: entry.documentTypeId,
    documentTypeName: entry.documentTypeName,
    data: entry.data,
    createdAt: new Date().toISOString(),
  };
  items.unshift(record);
  writeAll(items);
  return record;
}

export function getHistory() {
  return readAll();
}

export function getHistoryEntry(id) {
  return readAll().find((r) => r.id === id) || null;
}

export function deleteHistoryEntry(id) {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}
