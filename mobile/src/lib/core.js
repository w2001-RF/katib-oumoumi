// The core shared with the web app and the Telegram bot (js/core at the
// repository root). Screens import it from here, never by its long path.
export { validateField, fieldOptions, hasOtherOption, OTHER_OPTION, FIELD_TYPES } from '../../../js/core/validators.js';
export { renderTemplate } from '../../../js/core/templateEngine.js';
export { formatDateAr, formatDateTimeShort, MOROCCAN_MONTHS } from '../../../js/core/format.js';
export { addHistoryEntry, getHistory, getHistoryEntry, deleteHistoryEntry } from '../../../js/core/history.js';
export { getSessionId } from '../../../js/core/session.js';
export { createCatalog } from '../../../js/core/catalog.js';
export { documentHtml } from '../../../js/core/documentHtml.js';
export { normalizeForSearch } from '../../../js/core/arabicSearch.js';
export { ICONS } from '../../../js/core/iconPaths.js';
export { BRAND_SVG } from '../../../js/core/brandMark.js';
export * from '../../../js/core/appInfo.js';
