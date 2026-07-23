// ============================================================
// Content inbox v2 — where saved reels stop dying.
// Sorted by life area, five statuses, your notes + Claude's
// verdict + a validity score, and a "doing it now" shelf.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction } from '../ui.js';

export const AREAS = ['Sleep', 'Diet', 'Training', 'Mobility', 'Supplements', 'Mind', 'Mindset', 'Health', 'Looks', 'Social', 'Money', 'Trading', 'Other'];

const STATUSES = ['new', 'reviewing', 'reviewed', 'doing', 'rejected'];
const META = {
  new:       { label: 'To review', emoji: '📥', chip: 'chip--tag' },
  reviewing: { label: 'With Claude', emoji: '🔎', chip: 'chip--streak' },
  reviewed:  { label: 'Reviewed', emoji: '✅', chip: 'chip--streak' },
  doing:     { label: 'In my life', emoji: '🔥', chip: 'chip--key' },
  rejected:  { label: 'Binned', emoji: '🗑', chip: '' },
};

let filterArea = 'all';
let openId = null;

function domain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return (url || '').slice(0, 30); }
}

function scoreDots(score) {
  if (!score) return null;
  return el('span', { class: 'chip', title: 'Claude’s validity score' }, '★'.repeat(score) + '☆'.repeat(5 - score));
}

function itemCard(it, rerender) {
  const open = openId === it.id;
  const head = el('div', { class: 'row', onClick: (e) => { if (e.target.closest('button,a')) return; openId = open ? null : it.id; rerender(); } },
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, it.note || domain(it.url)),
      el('div', { class: 'row__meta' },
        it.area ? el('span', { class: 'chip chip--tag' }, it.area) : null,
        scoreDots(it.score),
        el('a', { href: it.url, target: '_blank', rel: 'noopener', style: 'color:var(--blue);font-size:12.5px' }, 'open ↗'))),
    el('button', {
      class: 'btn btn--sm', title: 'Change status',
      onClick: () => { update((d) => { const x = d.inbox.find((a) => a.id === it.id); x.status = STATUSES[(STATUSES.indexOf(x.status) + 1) % STATUSES.length]; }); rerender(); },
    }, META[it.status].emoji),
    el('button', { class: 'btn btn--icon' }, open ? '▾' : '▸'));

  if (!open) return el('div', { class: 'card card--tight' }, head);

  // expanded: Claude's verdict + my notes + area picker
  const verdict = el('textarea', { placeholder: 'Claude’s verdict — what’s true, what’s nonsense, how to use it…' });
  verdict.value = it.verdict || '';
  verdict.addEventListener('change', () => update((d) => { d.inbox.find((a) => a.id === it.id).verdict = verdict.value.trim(); }));

  const mine = el('textarea', { placeholder: 'My notes — why I saved it, what I want from it…' });
  mine.value = it.myNotes || '';
  mine.addEventListener('change', () => { update((d) => { d.inbox.find((a) => a.id === it.id).myNotes = mine.value.trim(); }); toast('Note saved'); });

  const area = el('select', {}, el('option', { value: '' }, '— area —'), ...AREAS.map((a) => el('option', { value: a, selected: it.area === a ? true : null }, a)));
  area.addEventListener('change', () => { update((d) => { d.inbox.find((a2) => a2.id === it.id).area = area.value; }); rerender(); });

  const score = el('select', {}, el('option', { value: '' }, '— score —'), ...[1, 2, 3, 4, 5].map((n) => el('option', { value: n, selected: +it.score === n ? true : null }, `${n}/5`)));
  score.addEventListener('change', () => { update((d) => { d.inbox.find((a) => a.id === it.id).score = +score.value || 0; }); rerender(); });

  return el('div', { class: 'card' }, head,
    el('div', { class: 'rowflex', style: 'margin-top:8px' }, area, score),
    el('div', { class: 'field', style: 'margin-top:10px' }, el('span', {}, '🧠 Claude’s verdict'), verdict),
    el('div', { class: 'field' }, el('span', {}, '✍️ My notes'), mine),
    el('button', { class: 'btn btn--danger btn--full', onClick: () => { if (confirmAction('Delete this item?')) { update((d) => { d.inbox = d.inbox.filter((a) => a.id !== it.id); }); openId = null; rerender(); } } }, 'Delete'));
}

function addForm(rerender) {
  const url = el('input', { type: 'url', placeholder: 'Paste a link (reel, TikTok, video, article…)' });
  const note = el('input', { type: 'text', placeholder: 'What caught your eye?', maxlength: '120' });
  const area = el('select', {}, el('option', { value: '' }, '— area (optional) —'), ...AREAS.map((a) => el('option', { value: a }, a)));

  function submit() {
    const u = url.value.trim();
    if (!u) { toast('Paste a link first'); return; }
    update((d) => { d.inbox.unshift({ id: uid(), url: u, note: note.value.trim(), area: area.value, status: 'new', verdict: '', score: 0, myNotes: '', createdAt: new Date().toISOString() }); });
    url.value = ''; note.value = '';
    toast('Captured. It won’t die here.'); rerender();
  }
  return el('div', { class: 'card' },
    el('div', { class: 'stack' }, url, note, area,
      el('button', { class: 'btn btn--primary btn--full', onClick: submit }, '⬇ Capture')),
    el('div', { class: 'hint' }, 'Say “review my inbox” to Claude — links get researched, scored and turned into habits.'));
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Content inbox'));
  view.append(addForm(rerender));

  if (!d.inbox.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '⬇'), el('div', {}, 'Empty. Paste your first link above.')));
    return;
  }

  // area filter
  const areasPresent = [...new Set(d.inbox.map((i) => i.area).filter(Boolean))].sort();
  const filters = el('div', { class: 'chiprow' },
    el('button', { class: 'chipbtn' + (filterArea === 'all' ? ' on' : ''), onClick: () => { filterArea = 'all'; rerender(); } }, `All · ${d.inbox.length}`),
    ...areasPresent.map((a) => el('button', { class: 'chipbtn' + (filterArea === a ? ' on' : ''), onClick: () => { filterArea = a; rerender(); } },
      `${a} · ${d.inbox.filter((i) => i.area === a).length}`)));
  view.append(filters);

  const items = filterArea === 'all' ? d.inbox : d.inbox.filter((i) => i.area === filterArea);

  for (const s of STATUSES) {
    const list = items.filter((i) => i.status === s);
    if (!list.length) continue;
    view.append(el('div', { class: 'section-title' }, `${META[s].emoji} ${META[s].label} · ${list.length}`));
    list.forEach((i) => view.append(itemCard(i, rerender)));
  }
}

export default { render };
