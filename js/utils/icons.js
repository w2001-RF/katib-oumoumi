// The app's icons as HTML strings; the drawings live in js/core/iconPaths.js
// (shared with the mobile app).

import { ICONS } from '../core/iconPaths.js';

// Icons are decorative: the text beside them, or the button's aria-label, names the action.
export function icon(name, extraClass) {
  const svg = (ICONS[name] || ICONS.document).replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
  if (extraClass) {
    return `<span class="${extraClass}">${svg}</span>`;
  }
  return svg;
}

// Category icon tones from the charte; their light and dark colours are CSS
// variables in css/styles.css.
export const CATEGORY_ICON_COLORS = [1, 2, 3, 4, 5, 6].map((n) => ({
  bg: `var(--tone-${n}-bg)`,
  fg: `var(--tone-${n}-fg)`,
}));

export default icon;
