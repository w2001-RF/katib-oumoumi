import { icon } from '../utils/icons.js';
import { renderHeader, renderBottomNav, attachHeaderBack, showToast } from '../ui.js';
import { getHistory, deleteHistoryEntry } from '../history.js';
import { formatDateTimeShort } from '../utils/format.js';
import { fetchDocumentType, fetchTemplateFields } from '../api.js';
import { renderTemplate } from '../utils/templateEngine.js';
import { documentLoader, bindShareButton } from '../utils/shareButton.js';
import { navigate } from '../router.js';

export async function renderHistory(container) {
  container.innerHTML = `
    ${renderHeader({ title: 'سجل الوثائق' })}
    <main class="app-main" id="history-main"></main>
    ${renderBottomNav('/history')}
  `;
  attachHeaderBack(container, '/');

  const main = container.querySelector('#history-main');
  paint();

  function paint() {
    const items = getHistory();
    if (!items.length) {
      main.innerHTML = `
        <div class="empty-state">
          ${icon('history')}
          <p>لا توجد وثائق في السجل بعد.<br/>الوثائق التي تولّدها ستظهر هنا.</p>
        </div>`;
      return;
    }
    main.innerHTML = items
      .map(
        (item) => `
      <div class="history-card" data-id="${item.id}">
        <div class="top-row">
          <div class="icon-box">${icon('fileText')}</div>
          <div>
            <p class="title">${item.documentTypeName}</p>
            <p class="meta">${formatDateTimeShort(item.createdAt)}</p>
          </div>
        </div>
        <div class="action-row">
          <button class="btn-danger-outline" data-action="delete">${icon('trash')} حذف</button>
          <button class="btn-light" data-action="share">${icon('share2')} مشاركة</button>
          <button class="btn-light" data-action="open">${icon('open')} فتح</button>
        </div>
      </div>`
      )
      .join('');

    main.querySelectorAll('.history-card').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        deleteHistoryEntry(id);
        showToast('تم حذف الوثيقة من السجل');
        paint();
      });
      card.querySelector('[data-action="open"]').addEventListener('click', () => {
        navigate(`/ready/${id}`);
      });
      const entry = items.find((r) => r.id === id);
      bindShareButton(card.querySelector('[data-action="share"]'), {
        load: documentLoader(async () => {
          const [docType, fields] = await Promise.all([
            fetchDocumentType(entry.documentTypeId),
            fetchTemplateFields(entry.documentTypeId),
          ]);
          return renderTemplate(docType.template_body, fields, entry.data);
        }),
        filename: entry.documentTypeName.replace(/\s+/g, '_'),
        title: entry.documentTypeName,
      });
    });
  }
}
