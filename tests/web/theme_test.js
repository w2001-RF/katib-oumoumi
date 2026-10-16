import { assertEquals } from 'jsr:@std/assert@1';
import { applyTheme, bindThemeToggle, readThemePref, resolveTheme, THEME_KEY, toggledTheme } from '../../js/theme.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const blockedStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

const system = (dark) => ({ matchMedia: () => ({ matches: dark }) });

function fakeDoc() {
  const listeners = [];
  return {
    documentElement: { dataset: {} },
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    click: (target) => listeners.filter((l) => l.type === 'click').forEach((l) => l.fn({ target })),
  };
}

Deno.test('theme preference: saved value, else auto', () => {
  assertEquals(readThemePref(memoryStorage({ [THEME_KEY]: 'dark' })), 'dark');
  assertEquals(readThemePref(memoryStorage({ [THEME_KEY]: 'purple' })), 'auto');
  assertEquals(readThemePref(memoryStorage()), 'auto');
  assertEquals(readThemePref(blockedStorage), 'auto');
  assertEquals(readThemePref(null), 'auto');
});

Deno.test('resolveTheme: explicit choice wins, auto follows the system', () => {
  assertEquals([resolveTheme('light', true), resolveTheme('dark', false)], ['light', 'dark']);
  assertEquals([resolveTheme('auto', true), resolveTheme('auto', false)], ['dark', 'light']);
});

Deno.test('applyTheme: sets data-theme and remembers the choice', () => {
  const doc = fakeDoc();
  const storage = memoryStorage();
  assertEquals(applyTheme('dark', { doc, storage, win: system(false) }), 'dark');
  assertEquals([doc.documentElement.dataset.theme, storage.getItem(THEME_KEY)], ['dark', 'dark']);

  assertEquals(applyTheme('auto', { doc, storage, win: system(true) }), 'dark', 'auto shows the system theme');
  assertEquals([doc.documentElement.dataset.theme, storage.getItem(THEME_KEY)], [undefined, null]);

  assertEquals(applyTheme('nonsense', { doc, storage, win: {} }), 'light', 'unknown → auto; no matchMedia → light');
  assertEquals(applyTheme('light', { doc, storage: blockedStorage, win: { matchMedia: () => { throw new Error('x'); } } }), 'light');
  assertEquals(doc.documentElement.dataset.theme, 'light', 'applies even when it cannot be saved');
});

Deno.test('toggle: switches to the opposite of what is shown', () => {
  assertEquals(toggledTheme({ storage: memoryStorage(), win: system(true) }), 'light');
  assertEquals(toggledTheme({ storage: memoryStorage(), win: system(false) }), 'dark');
  assertEquals(toggledTheme({ storage: memoryStorage({ [THEME_KEY]: 'dark' }), win: system(false) }), 'light');

  const doc = fakeDoc();
  const storage = memoryStorage();
  bindThemeToggle(doc, { storage, win: system(false) });
  doc.click({ closest: () => null });
  assertEquals(doc.documentElement.dataset.theme, undefined, 'other clicks are ignored');
  doc.click({ closest: (sel) => (sel === '[data-action="toggle-theme"]' ? {} : null) });
  assertEquals([doc.documentElement.dataset.theme, storage.getItem(THEME_KEY)], ['dark', 'dark']);
  doc.click({ closest: () => ({}) });
  assertEquals(doc.documentElement.dataset.theme, 'light');
  doc.click(null);
  assertEquals(doc.documentElement.dataset.theme, 'light');
});
