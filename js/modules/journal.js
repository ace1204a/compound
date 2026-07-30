// ============================================================
// Journal — a running diary. Drop timestamped notes through the
// day: how you feel, what you've done, what you're thinking.
// Day slider to read/edit any past day.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, keyToDate, prettyDate, confirmAction } from '../ui.js';

let selectedDay = todayKey();
let editingId = null;

function nowHHMM() {
  const n = new Date();
  return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
}

function dayNav(rerender) {
  return el('div', { class: 'rowflex', style: 'margin-bottom:10px' },
    el('button', { class: 'btn btn--icon', onClick: () => { selectedDay = addDays(selectedDay, -1); rerender(); } }, '‹'),
    el('div', { style: 'flex:1;text-align:center;font-weight:700' }, selectedDay === todayKey() ? 'Today' : prettyDate(keyToDate(selectedDay))),
    el('button', { class: 'btn btn--icon', onClick: () => { selectedDay = addDays(selectedDay, 1); rerender(); } }, '›'),
    selectedDay !== todayKey() ? el('button', { class: 'btn btn--sm', onClick: () => { selectedDay = todayKey(); rerender(); } }, 'Today') : null);
}

function entryRow(e, rerender) {
  if (editingId === e.id) {
    const time = el('input', { type: 'time', value: e.time || '', style: 'max-width:110px' });
    const text = el('textarea', {}); text.value = e.text || '';
    return el('div', { class: 'card card--tight' },
      el('div', { class: 'rowflex', style: 'margin-bottom:8px' }, el('span', { class: 'card__sub' }, 'Time'), time),
      text,
      el('div', { class: 'rowflex', style: 'margin-top:8px' },
        el('button', { class: 'btn btn--sm btn--primary', onClick: () => { update((d) => { const x = d.journal[selectedDay].find((a) => a.id === e.id); x.time = time.value || x.time; x.text = text.value.trim(); }); editingId = null; toast('Saved'); rerender(); } }, 'Save'),
        el('button', { class: 'btn btn--sm', onClick: () => { editingId = null; rerender(); } }, 'Cancel')));
  }
  return el('div', { class: 'jentry' },
    el('div', { class: 'jentry__time' }, e.time || ''),
    el('div', { class: 'jentry__body' },
      el('div', { class: 'jentry__text' }, e.text),
      el('div', { class: 'rowflex' },
        el('button', { class: 'btn btn--icon', title: 'Edit', onClick: () => { editingId = e.id; rerender(); } }, '✎'),
        el('button', { class: 'btn btn--icon', title: 'Delete', onClick: () => { if (confirmAction('Delete this entry?')) { update((d) => { d.journal[selectedDay] = (d.journal[selectedDay] || []).filter((a) => a.id !== e.id); }); rerender(); } } }, '×'))));
}

function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();
  const key = selectedDay;
  const entries = [...(d.journal[key] || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  view.append(el('div', { class: 'section-title' }, 'Journal'));
  view.append(dayNav(rerender));

  // quick add
  const text = el('textarea', { placeholder: 'What’s on your mind? How are you feeling, what have you done…' });
  const add = () => {
    const v = text.value.trim();
    if (!v) { toast('Write something first'); return; }
    update((x) => { x.journal[key] = x.journal[key] || []; x.journal[key].push({ id: uid(), time: nowHHMM(), text: v }); });
    text.value = ''; toast('Noted'); rerender();
  };
  view.append(el('div', { class: 'card' }, text, el('button', { class: 'btn btn--primary btn--full', style: 'margin-top:8px', onClick: add }, '+ Add note')));

  if (!entries.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '📓'), el('div', {}, 'No entries for this day yet.')));
  } else {
    const card = el('div', { class: 'card' });
    entries.forEach((e) => card.append(entryRow(e, rerender)));
    view.append(card);
  }
  window.scrollTo(0, y);
}

export default { render };
