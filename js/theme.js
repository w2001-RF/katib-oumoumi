// Light / dark mode. The palette lives in css/styles.css: without a choice the
// app follows the system (prefers-color-scheme); an explicit choice sets
// <html data-theme="light|dark">. index.html applies the saved choice before
// the first paint so the page never flashes the wrong theme.

export const THEME_KEY = 'katib-theme';
export const THEMES = ['auto', 'light', 'dark'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The saved preference: 'auto' (default), 'light' or 'dark'. */
export function readThemePref(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : 'auto';
  } catch {
    return 'auto'; // storage blocked (private mode, disabled cookies)
  }
}

/** The theme actually shown for a preference. */
export function resolveTheme(pref, prefersDark) {
  if (pref === 'light' || pref === 'dark') return pref;
  return prefersDark ? 'dark' : 'light';
}

function systemPrefersDark(win) {
  try {
    return Boolean(win.matchMedia?.(DARK_QUERY).matches);
  } catch {
    return false;
  }
}

/** Shows `pref` and remembers it. Returns the theme now shown. */
export function applyTheme(pref, { doc = globalThis.document, storage = globalThis.localStorage, win = globalThis } = {}) {
  const choice = THEMES.includes(pref) ? pref : 'auto';
  const root = doc.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'auto') storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, choice);
  } catch {
    /* the choice still applies to this visit */
  }
  return resolveTheme(choice, systemPrefersDark(win));
}

/** The preference a one-tap toggle switches to: the opposite of what is shown. */
export function toggledTheme(deps = {}) {
  const shown = resolveTheme(readThemePref(deps.storage), systemPrefersDark(deps.win ?? globalThis));
  return shown === 'dark' ? 'light' : 'dark';
}

/** Any element with data-action="toggle-theme" (the desktop sidebar button) flips the theme. */
export function bindThemeToggle(doc = globalThis.document, deps = {}) {
  doc.addEventListener('click', (e) => {
    if (!e.target?.closest?.('[data-action="toggle-theme"]')) return;
    applyTheme(toggledTheme(deps), { doc, ...deps });
  });
}
