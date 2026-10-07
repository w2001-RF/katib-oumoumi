import { escapeHtml } from './format.js';
import { OTHER_OPTION } from './validators.js';

const CHEVRON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// Arabic-aware normalisation so that e.g. «اكادير» finds «أكادير»:
// ignores hamza/madda forms, ta marbuta vs ha, alif maqsura vs ya,
// diacritics, tatweel and letter case.
export function normalizeForSearch(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

// Turns a native <select> into a dropdown with a search box. The native
// select stays in the DOM (hidden) as the source of truth: its value is
// what forms read, and choosing an option fires its 'change' event, so
// existing code keeps working unchanged.
export function enhanceSelect(select) {
  if (select.dataset.enhanced) return;
  select.dataset.enhanced = '1';

  const first = select.options[0];
  const placeholder = first && first.value === '' ? first.text : '— اختر —';
  const options = [...select.options]
    .filter((o) => o.value !== '')
    .map((o) => ({ value: o.value, label: o.text, key: normalizeForSearch(o.text) }));

  const combo = document.createElement('div');
  combo.className = 'combo';
  combo.innerHTML = `
    <button type="button" class="combo-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="combo-value"></span>${CHEVRON}
    </button>
    <div class="combo-panel" hidden>
      <input type="search" class="combo-search" placeholder="ابحث..." autocomplete="off" />
      <ul class="combo-list" role="listbox"></ul>
    </div>`;
  select.classList.add('combo-native');
  select.after(combo);

  const trigger = combo.querySelector('.combo-trigger');
  const valueEl = combo.querySelector('.combo-value');
  const panel = combo.querySelector('.combo-panel');
  const search = combo.querySelector('.combo-search');
  const list = combo.querySelector('.combo-list');
  let visible = [];
  let active = 0;

  function paintValue() {
    const current = options.find((o) => o.value === select.value);
    valueEl.textContent = current ? current.label : placeholder;
    valueEl.classList.toggle('is-placeholder', !current);
  }

  function paintList() {
    const words = normalizeForSearch(search.value).split(' ').filter(Boolean);
    visible = options.filter(
      // «أخرى» stays visible so a user can always type a missing value.
      (o) => o.value === OTHER_OPTION || words.every((w) => o.key.includes(w))
    );
    const hasMatch = visible.some((o) => o.value !== OTHER_OPTION);
    active = Math.min(active, Math.max(visible.length - 1, 0));
    list.innerHTML =
      (hasMatch || !words.length ? '' : '<li class="combo-empty">لا توجد نتائج</li>') +
      visible
        .map(
          (o, i) =>
            `<li class="combo-option${i === active ? ' active' : ''}" role="option" data-index="${i}"
              aria-selected="${o.value === select.value}">${escapeHtml(o.label)}</li>`
        )
        .join('');
    const activeEl = list.querySelector('.combo-option.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    combo.classList.add('open');
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    search.value = '';
    active = Math.max(options.findIndex((o) => o.value === select.value), 0);
    paintList();
    search.focus();
    document.addEventListener('pointerdown', onOutside);
  }

  function close() {
    combo.classList.remove('open');
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside);
  }

  function choose(option) {
    select.value = option.value;
    paintValue();
    close();
    trigger.focus();
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function onOutside(e) {
    if (!combo.contains(e.target)) close();
  }

  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
  search.addEventListener('input', () => {
    active = 0;
    paintList();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
      paintList();
    } else if (e.key === 'Enter') {
      e.preventDefault(); // don't submit the surrounding form
      if (visible[active]) choose(visible[active]);
    } else if (e.key === 'Escape') {
      close();
      trigger.focus();
    }
  });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.combo-option');
    if (item) choose(visible[Number(item.dataset.index)]);
  });

  paintValue();
}

export function enhanceSelects(root) {
  root.querySelectorAll('select').forEach(enhanceSelect);
}
