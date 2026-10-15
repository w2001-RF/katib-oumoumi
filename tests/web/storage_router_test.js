import '../support/setup.js';
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { addHistoryEntry, clearHistory, deleteHistoryEntry, getHistory, getHistoryEntry } from '../../js/history.js';
import { getSessionId } from '../../js/session.js';
import { currentPath, initRouter, navigate, registerRoute, renderCurrentRoute } from '../../js/router.js';

// --- localStorage-backed modules ------------------------------------------------

Deno.test('history: add, read, delete, clear, corrupted storage', () => {
  clearHistory();
  assertEquals(getHistory(), []);
  const a = addHistoryEntry({ documentTypeId: 'd1', documentTypeName: 'شكاية', data: { x: '1' } });
  const b = addHistoryEntry({ documentTypeId: 'd2', documentTypeName: 'عقد', data: {} });
  assertEquals(getHistory().map((r) => r.id), [b.id, a.id], 'newest first');
  assertEquals(getHistoryEntry(a.id)?.data, { x: '1' });
  assertEquals(getHistoryEntry('missing'), null);
  deleteHistoryEntry(a.id);
  assertEquals(getHistory().length, 1);
  localStorage.setItem('ko_history', '{not json');
  assertEquals(getHistory(), []);
  clearHistory();
});

Deno.test('history keeps the 50 most recent entries', () => {
  clearHistory();
  for (let i = 0; i < 55; i++) addHistoryEntry({ documentTypeId: String(i), documentTypeName: '', data: {} });
  assertEquals(getHistory().length, 50);
  assertEquals(getHistory()[0].documentTypeId, '54');
  clearHistory();
});

Deno.test('session id is created once and reused', () => {
  localStorage.removeItem('ko_session_id');
  const id = getSessionId();
  assert(id.length > 10);
  assertEquals(getSessionId(), id);
});

// --- router -------------------------------------------------------------------

function fakeLocation(hash = '') {
  const listeners = {};
  globalThis.location = { hash };
  globalThis.addEventListener = (type, fn) => {
    listeners[type] = fn;
  };
  return listeners;
}

Deno.test('router matches patterns, decodes params, cleans up the previous view', async () => {
  const listeners = fakeLocation('#/doc/abc%20d');
  const mount = { scrollTop: 50, innerHTML: '' };
  const visited = [];
  let cleaned = 0;
  registerRoute('/doc/:id', (el, params) => {
    el.innerHTML = `doc ${params.id}`;
    return () => cleaned++;
  });
  registerRoute('/a.b', (el) => {
    el.innerHTML = 'dotted';
  });
  initRouter(mount, (path) => visited.push(path));
  assert(typeof listeners.hashchange === 'function');

  await renderCurrentRoute();
  assertEquals(mount.innerHTML, 'doc abc d');
  assertEquals(mount.scrollTop, 0);

  globalThis.location.hash = '#/a.b';
  await renderCurrentRoute();
  assertEquals(mount.innerHTML, 'dotted');
  assertEquals(cleaned, 1);

  globalThis.location.hash = '#/aXb'; // "." is literal, not "any character"
  await renderCurrentRoute();
  assertEquals(mount.innerHTML.includes('الصفحة غير موجودة'), true);
  assertEquals(visited, ['/doc/abc%20d', '/a.b', '/aXb']);
});

Deno.test('currentPath and navigate', async () => {
  fakeLocation('');
  assertEquals(currentPath(), '/');
  globalThis.location.hash = 'raw';
  assertEquals(currentPath(), 'raw');

  const mount = { scrollTop: 0, innerHTML: '' };
  initRouter(mount, null);
  navigate('/elsewhere');
  assertEquals(globalThis.location.hash, '/elsewhere');

  registerRoute('/same', (el) => {
    el.innerHTML = 'same again';
  });
  globalThis.location.hash = '#/same';
  navigate('/same'); // already there: re-render instead of changing the hash
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(mount.innerHTML, 'same again');
});
