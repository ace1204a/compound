// ============================================================
// Books — reading list, current book with notes, statuses.
// The full Reading HQ (tutor, learning journal) comes later;
// tutoring already works: tell Claude the book, discuss it.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction } from '../ui.js';

const STATUSES = ['want', 'reading', 'finished'];
const LABEL = { want: 'Want to read', reading: 'Reading now', finished: 'Finished' };

function bookRow(b, rerender) {
  return el('div', { class: 'row' },
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, b.title),
      b.author ? el('div', { class: 'row__meta' }, b.author) : null),
    el('button', { class: 'btn btn--sm', onClick: () => {
      update((d) => { const x = d.books.find((a) => a.id === b.id); x.status = STATUSES[(STATUSES.indexOf(x.status) + 1) % STATUSES.length]; });
      rerender();
    } }, LABEL[b.status]),
    el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction(`Remove "${b.title}"?`)) { update((d) => { d.books = d.books.filter((a) => a.id !== b.id); }); rerender(); } } }, '×'),
  );
}

function currentCard(rerender) {
  const d = getData();
  const cur = d.books.find((b) => b.status === 'reading');
  if (!cur) return null;

  const notes = el('textarea', { placeholder: 'Notes while reading — ideas, lines, things to apply…' });
  notes.value = cur.notes || '';
  notes.addEventListener('change', () => { update((x) => { const b = x.books.find((a) => a.id === cur.id); b.notes = notes.value; }); toast('Notes saved'); });

  return el('div', { class: 'card card--accent' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, '📖 ' + cur.title),
      el('span', { class: 'chip chip--key' }, 'reading now')),
    cur.author ? el('div', { class: 'card__sub', style: 'margin-bottom:8px' }, cur.author) : null,
    notes,
    el('div', { class: 'hint' }, 'Want to actually understand it? Tell Claude the chapter — instant book tutor.'),
  );
}

function addForm(rerender) {
  const title = el('input', { type: 'text', placeholder: 'Book title', maxlength: '90' });
  const author = el('input', { type: 'text', placeholder: 'Author (optional)', maxlength: '60' });
  return el('div', { class: 'card' },
    el('div', { class: 'stack' }, title, author,
      el('button', { class: 'btn btn--primary btn--full', onClick: () => {
        const t = title.value.trim(); if (!t) { toast('Title first'); return; }
        update((d) => { d.books.push({ id: uid(), title: t, author: author.value.trim(), status: 'want', notes: '', addedAt: new Date().toISOString() }); });
        title.value = ''; author.value = ''; toast('Added to the list'); rerender();
      } }, '+ Add book')));
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Books'));
  const cur = currentCard(rerender);
  if (cur) view.append(cur);
  view.append(addForm(rerender));

  const d = getData();
  for (const s of ['reading', 'want', 'finished']) {
    const items = d.books.filter((b) => b.status === s);
    if (!items.length) continue;
    view.append(el('div', { class: 'section-title' }, `${LABEL[s]} · ${items.length}`));
    const c = el('div', { class: 'card' });
    items.forEach((b) => c.append(bookRow(b, rerender)));
    view.append(c);
  }
  if (!d.books.length) view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '📚'), el('div', {}, 'Add the first book. Ten pages a day is 12+ books a year.')));
}

export default { render };
