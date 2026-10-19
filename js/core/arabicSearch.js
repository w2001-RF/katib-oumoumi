// Arabic-aware normalisation so that e.g. «اكادير» finds «أكادير»:
// ignores hamza/madda forms, ta marbuta vs ha, alif maqsura vs ya,
// diacritics, tatweel and letter case.
export function normalizeForSearch(str) {
  return String(str ?? '')
    .toLowerCase()
    .replaceAll(/[ً-ٰٟـ]/g, '')
    .replaceAll(/[أإآٱ]/g, 'ا')
    .replaceAll('ة', 'ه')
    .replaceAll('ى', 'ي')
    .replaceAll('ؤ', 'و')
    .replaceAll('ئ', 'ي')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
