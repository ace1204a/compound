// ============================================================
// Journal — a running diary. Drop timestamped notes through the
// day: how you feel, what you've done, what you're thinking.
// Day slider to read/edit any past day.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, keyToDate, prettyDate, confirmAction, restoreScroll, monthMatrix, shiftMonth, monthLabel } from '../ui.js';

let selectedDay = todayKey();
let editingId = null;
let showMonth = false;
let calMonth = todayKey().slice(0, 7);

/** One-line gist of a day — first entry, trimmed. */
function dayBrief(d, key) {
  const entries = (d.journal[key] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (!entries.length) return null;
  const words = entries.map((e) => e.text).join(' ').replace(/\s+/g, ' ').trim();
  return { count: entries.length, gist: words.slice(0, 150) + (words.length > 150 ? '…' : '') };
}

function monthCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'rowflex', style: 'margin-bottom:6px' },
    el('button', { class: 'btn btn--icon', onClick: () => { calMonth = shiftMonth(calMonth, -1); rerender(); } }, '‹'),
    el('div', { style: 'flex:1;text-align:center;font-weight:700' }, monthLabel(calMonth)),
    el('button', { class: 'btn btn--icon', onClick: () => { calMonth = shiftMonth(calMonth, 1); rerender(); } }, '›')));

  const grid = el('div', { class: 'cal' });
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((n) => grid.append(el('div', { class: 'cal__dow' }, n)));
  for (const key of monthMatrix(calMonth)) {
    if (!key) { grid.append(el('div', {})); continue; }
    const b = dayBrief(d, key);
    const cls = 'cal__cell' + (b ? (b.count >= 3 ? ' cal__cell--l3' : ' cal__cell--l2') : '')
      + (key === todayKey() ? ' cal__cell--today' : '') + (key === selectedDay ? ' cal__cell--sel' : '');
    grid.append(el('button', { class: cls, title: b ? `${b.count} entries` : key, onClick: () => { selectedDay = key; showMonth = false; rerender(); } }, String(+key.slice(-2))));
  }
  card.append(grid);
  card.append(el('div', { class: 'hint' }, 'Greener = more entries. Tap a day to open it.'));

  // quick briefs — skim the month without opening each day
  const days = monthMatrix(calMonth).filter(Boolean).filter((k) => d.journal[k] && d.journal[k].length).reverse();
  if (days.length) {
    card.append(el('div', { class: 'section-title', style: 'margin:14px 2px 6px' }, 'At a glance'));
    days.slice(0, 14).forEach((k) => {
      const b = dayBrief(d, k);
      card.append(el('div', { class: 'row', onClick: () => { selectedDay = k; showMonth = false; rerender(); }, style: 'cursor:pointer' },
        el('div', { class: 'row__main' },
          el('div', { class: 'row__name' }, prettyDate(keyToDate(k)), ' ', el('span', { class: 'chip' }, `${b.count}`)),
          el('div', { class: 'row__meta', style: 'display:block' }, b.gist))));
    });
  }
  return card;
}

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

  view.append(el('div', { class: 'rowflex' },
    el('div', { class: 'section-title', style: 'flex:1' }, 'Journal'),
    el('button', { class: 'btn btn--sm' + (showMonth ? ' btn--primary' : ' btn--ghost'), onClick: () => { showMonth = !showMonth; rerender(); } }, showMonth ? '☰ Day' : '📅 Month')));

  if (showMonth) { view.append(monthCard(rerender)); restoreScroll(y); return; }

  view.append(dayNav(rerender));

  // quick add — the draft is saved as you type, so leaving the app never loses it
  const DRAFT_KEY = 'compound.journal.draft.' + key;
  const text = el('textarea', { placeholder: 'What’s on your mind? How are you feeling, what have you done…' });
  try { text.value = localStorage.getItem(DRAFT_KEY) || ''; } catch (_) {}
  const saveDraft = () => { try { text.value.trim() ? localStorage.setItem(DRAFT_KEY, text.value) : localStorage.removeItem(DRAFT_KEY); } catch (_) {} };
  text.addEventListener('input', saveDraft);
  text.addEventListener('blur', saveDraft);
  window.addEventListener('pagehide', saveDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });

  const draftNote = el('div', { class: 'hint' }, text.value.trim() ? '📝 Unsaved draft restored — finish it and add the note.' : 'Saves as you type. Safe to leave the app mid-sentence.');
  const add = () => {
    const v = text.value.trim();
    if (!v) { toast('Write something first'); return; }
    update((x) => { x.journal[key] = x.journal[key] || []; x.journal[key].push({ id: uid(), time: nowHHMM(), text: v }); });
    text.value = ''; try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    toast('Noted'); rerender();
  };
  view.append(el('div', { class: 'card' }, text,
    el('button', { class: 'btn btn--primary btn--full', style: 'margin-top:8px', onClick: add }, '+ Add note'),
    draftNote));

  if (!entries.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '📓'), el('div', {}, 'No entries for this day yet.')));
  } else {
    const card = el('div', { class: 'card' });
    entries.forEach((e) => card.append(entryRow(e, rerender)));
    view.append(card);
  }
  restoreScroll(y);
}

export default { render };
