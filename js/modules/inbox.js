// ============================================================
// Content inbox — where saved reels stop dying.
// Paste link + note → status: new → reviewed → adopted/rejected.
// "Review with Claude" happens in sessions; the verdict and
// what-to-do land back here.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction } from '../ui.js';

const STATUSES = ['new', 'reviewed', 'adopted', 'rejected'];
const STATUS_META = {
  new:      { label: 'New',      chip: 'chip--tag' },
  reviewed: { label: 'Reviewed', chip: 'chip--streak' },
  adopted:  { label: 'Adopted',  chip: 'chip--key' },
  rejected: { label: 'Rejected', chip: '' },
};

function domain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url.slice(0, 30); }
}

function itemRow(it, rerender) {
  return el('div', { class: 'row' },
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, it.note || domain(it.url)),
      el('div', { class: 'row__meta' },
        it.category ? el('span', { class: 'chip chip--tag' }, it.category) : null,
        el('a', { href: it.url, target: '_blank', rel: 'noopener', style: 'color:var(--blue);font-size:12.5px' }, domain(it.url) + ' ↗')),
      it.verdict ? el('div', { class: 'hint', style: 'margin-top:4px' }, '🧠 ' + it.verdict) : null,
    ),
    el('button', {
      class: 'btn btn--sm', title: 'Change status',
      onClick: () => {
        update((d) => { const x = d.inbox.find((a) => a.id === it.id); x.status = STATUSES[(STATUSES.indexOf(x.status) + 1) % STATUSES.length]; });
        rerender();
      },
    }, STATUS_META[it.status].label),
    el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction('Delete this item?')) { update((d) => { d.inbox = d.inbox.filter((a) => a.id !== it.id); }); rerender(); } } }, '×'),
  );
}

function addForm(rerender) {
  const url = el('input', { type: 'url', placeholder: 'Paste a link (reel, TikTok, article…)' });
  const note = el('input', { type: 'text', placeholder: 'What caught your eye? (optional)', maxlength: '120' });

  function submit() {
    const u = url.value.trim();
    if (!u) { toast('Paste a link first'); return; }
    update((d) => { d.inbox.unshift({ id: uid(), url: u, note: note.value.trim(), category: '', status: 'new', verdict: '', createdAt: new Date().toISOString() }); });
    url.value = ''; note.value = '';
    toast('Captured. It won’t die here.'); rerender();
  }

  return el('div', { class: 'card' },
    el('div', { class: 'stack' }, url, note,
      el('button', { class: 'btn btn--primary btn--full', onClick: submit }, '⬇ Capture')),
    el('div', { class: 'hint' }, 'Next session, tell Claude “review my inbox” — links get researched and fact-checked, winners become habits.'),
  );
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Content inbox'));
  view.append(addForm(rerender));

  const d = getData();
  if (!d.inbox.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '⬇'),
      el('div', {}, 'Empty. Paste your first saved reel above.')));
    return;
  }

  for (const s of STATUSES) {
    const items = d.inbox.filter((i) => i.status === s);
    if (!items.length) continue;
    view.append(el('div', { class: 'section-title' }, `${STATUS_META[s].label} · ${items.length}`));
    const c = el('div', { class: 'card' });
    items.forEach((i) => c.append(itemRow(i, rerender)));
    view.append(c);
  }
}

export default { render };
