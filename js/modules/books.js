// ============================================================
// Books — reading list, page log, notes and highlights.
// Log the pages you read each day; the app tracks pace and
// keeps every highlight so Claude can quiz you on the book.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, confirmAction } from '../ui.js';

const STATUSES = ['want', 'reading', 'finished'];
const LABEL = { want: 'Want to read', reading: 'Reading now', finished: 'Finished' };

export function pagesOn(d, key) {
  return d.books.reduce((n, b) => n + (b.sessions || []).filter((s) => s.date === key).reduce((m, s) => m + (+s.pages || 0), 0), 0);
}

function totalPages(b) { return (b.sessions || []).reduce((n, s) => n + (+s.pages || 0), 0); }

function currentCard(cur, rerender) {
  const d = getData();
  // accepts either a count ("12") or a page range ("159-167")
  const pages = el('input', { type: 'text', placeholder: 'pages — 12  or  159-167', inputmode: 'numeric', style: 'max-width:180px' });
  const pdate = el('input', { type: 'date', value: todayKey(), style: 'max-width:150px' });
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i - 6));
  const weekPages = last7.reduce((n, k) => n + pagesOn(d, k), 0);

  const highlight = el('input', { type: 'text', placeholder: 'Add a highlight / line worth keeping', maxlength: '280' });

  const card = el('div', { class: 'card card--accent' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, '📖 ' + cur.title),
      el('span', { class: 'chip chip--streak' }, `${totalPages(cur)} pages`)),
    cur.author ? el('div', { class: 'card__sub' }, cur.author) : null,
    el('div', { class: 'row__meta', style: 'margin-top:6px' },
      el('span', { class: 'chip' }, `${weekPages} pages this week`),
      pagesOn(d, todayKey()) ? el('span', { class: 'chip chip--key' }, `${pagesOn(d, todayKey())} today ✓`) : null),
    el('div', { class: 'rowflex', style: 'margin-top:10px' }, pages, pdate,
      el('button', { class: 'btn btn--primary', onClick: () => {
        const raw = pages.value.trim();
        const range = raw.match(/^(\d+)\s*[-–to]+\s*(\d+)$/i);
        const n = range ? (Math.abs(+range[2] - +range[1]) + 1) : (parseInt(raw, 10) || 0);
        if (!n) { toast('Pages — e.g. 12 or 159-167'); return; }
        const when = pdate.value || todayKey();
        update((x) => {
          const b = x.books.find((a) => a.id === cur.id);
          b.sessions = b.sessions || [];
          b.sessions.push({ date: when, pages: n, from: range ? +range[1] : null, to: range ? +range[2] : null });
        });
        pages.value = '';
        toast(`${n} pages logged 📖${range ? ` (p${range[1]}–${range[2]})` : ''}`); rerender();
      } }, 'Log pages')),
    // recent reading sessions — editable/removable
    (cur.sessions || []).length ? el('div', { style: 'margin-top:10px' },
      ...[...cur.sessions].reverse().slice(0, 5).map((s, i, arr) => el('div', { class: 'row' },
        el('div', { class: 'row__main' },
          el('div', { class: 'row__name' }, `${s.pages} pages${s.from ? ` · p${s.from}–${s.to}` : ''}`),
          el('div', { class: 'row__meta' }, s.date)),
        el('button', { class: 'btn btn--icon', title: 'Remove', onClick: () => {
          update((x) => { const b = x.books.find((a) => a.id === cur.id); const idx = b.sessions.lastIndexOf(s); if (idx > -1) b.sessions.splice(idx, 1); });
          rerender();
        } }, '×')))) : null,
    el('div', { class: 'rowflex', style: 'margin-top:10px' }, highlight,
      el('button', { class: 'btn', onClick: () => {
        const v = highlight.value.trim();
        if (!v) return;
        update((x) => { const b = x.books.find((a) => a.id === cur.id); b.highlights = b.highlights || []; b.highlights.push({ id: uid(), text: v, date: todayKey() }); });
        highlight.value = ''; toast('Highlight saved'); rerender();
      } }, '+')),
  );

  if ((cur.highlights || []).length) {
    card.append(el('div', { class: 'section-title', style: 'margin:14px 2px 6px' }, `Highlights · ${cur.highlights.length}`));
    cur.highlights.slice().reverse().slice(0, 8).forEach((h) => {
      card.append(el('div', { class: 'quote' }, '“' + h.text + '”',
        el('button', { class: 'btn btn--icon', style: 'float:right', onClick: () => { update((x) => { const b = x.books.find((a) => a.id === cur.id); b.highlights = b.highlights.filter((y) => y.id !== h.id); }); rerender(); } }, '×')));
    });
  }

  const notes = el('textarea', { placeholder: 'Notes — ideas, arguments, things to apply…' });
  notes.value = cur.notes || '';
  notes.addEventListener('change', () => { update((x) => { x.books.find((a) => a.id === cur.id).notes = notes.value; }); toast('Notes saved'); });
  card.append(el('div', { class: 'field', style: 'margin-top:12px' }, el('span', {}, 'My notes'), notes));
  card.append(el('div', { class: 'hint' }, 'Tell Claude “quiz me on my book” — it reads your highlights and tests whether it actually went in.'));
  return card;
}

function bookRow(b, rerender) {
  return el('div', { class: 'row' },
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, b.title),
      el('div', { class: 'row__meta' },
        b.author ? b.author : null,
        totalPages(b) ? el('span', { class: 'chip' }, `${totalPages(b)} pages`) : null)),
    el('button', { class: 'btn btn--sm', onClick: () => {
      update((d) => { const x = d.books.find((a) => a.id === b.id); x.status = STATUSES[(STATUSES.indexOf(x.status) + 1) % STATUSES.length]; });
      rerender();
    } }, LABEL[b.status]),
    el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction(`Remove "${b.title}"?`)) { update((d) => { d.books = d.books.filter((a) => a.id !== b.id); }); rerender(); } } }, '×'));
}

function addForm(rerender) {
  const title = el('input', { type: 'text', placeholder: 'Book title', maxlength: '90' });
  const author = el('input', { type: 'text', placeholder: 'Author (optional)', maxlength: '60' });
  return el('div', { class: 'card' },
    el('div', { class: 'stack' }, title, author,
      el('button', { class: 'btn btn--primary btn--full', onClick: () => {
        const t = title.value.trim(); if (!t) { toast('Title first'); return; }
        update((d) => { d.books.push({ id: uid(), title: t, author: author.value.trim(), status: 'want', notes: '', highlights: [], sessions: [], addedAt: new Date().toISOString() }); });
        title.value = ''; author.value = ''; toast('Added to the list'); rerender();
      } }, '+ Add book')));
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Books'));
  const cur = d.books.find((b) => b.status === 'reading');
  if (cur) view.append(currentCard(cur, rerender));
  view.append(addForm(rerender));

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
