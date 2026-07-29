// ============================================================
// Tasks — a day planner meant to replace the Notes checklist.
// Per-day tasks with optional time blocks, repeatable routines
// (daily / chosen weekdays / at set times), copy-from-previous-
// day, future pre-planning, a backlog for undated / longer-term
// tasks, reordering, inline edit, and a "next up" nudge.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, keyToDate, prettyDate, timeToMin, confirmAction } from '../ui.js';

let selectedDay = todayKey();
let editingId = null;
let showRoutines = false;

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_NUM = [1, 2, 3, 4, 5, 6, 0]; // maps DOW index -> JS getDay()

function routineOnDay(r, key) {
  if (r.freq === 'daily') return true;
  const dow = keyToDate(key).getDay();
  return (r.freq.days || []).includes(dow);
}

/** All items for a day = one-off tasks + routine instances, sorted by time. */
export function tasksForDay(d, key) {
  const oneoffs = (d.tasks || []).filter((t) => t.date === key).map((t) => ({ ...t, kind: 'task' }));
  const routineItems = (d.routines || []).filter((r) => routineOnDay(r, key)).map((r) => ({
    id: 'r:' + r.id, routineId: r.id, title: r.title, time: r.time, project: r.project, kind: 'routine',
    done: !!(d.routineDone || {})[r.id + ':' + key],
  }));
  const all = [...oneoffs, ...routineItems];
  all.sort((a, b) => {
    const ta = timeToMin(a.time), tb = timeToMin(b.time);
    if (ta != null && tb != null) return ta - tb;
    if (ta != null) return -1;
    if (tb != null) return 1;
    return (a.order || 0) - (b.order || 0);
  });
  return all;
}

export function toggleTaskItem(item, key) {
  if (item.kind === 'routine') {
    update((d) => { const k = item.routineId + ':' + key; if (d.routineDone[k]) delete d.routineDone[k]; else d.routineDone[k] = true; });
  } else {
    update((d) => { const t = d.tasks.find((x) => x.id === item.id); if (t) { t.done = !t.done; t.completedAt = t.done ? new Date().toISOString() : null; } });
  }
}

// ---------- add form ----------
function addForm(rerender) {
  let repeat = 'once';
  let days = [];

  const title = el('input', { type: 'text', placeholder: 'Add a task…', maxlength: '120' });
  const time = el('input', { type: 'text', placeholder: 'time (e.g. 08:00, optional)', maxlength: '5', inputmode: 'numeric', style: 'max-width:150px' });

  const seg = el('div', { class: 'seg' },
    ...[['once', 'One-off'], ['daily', 'Daily'], ['weekdays', 'Pick days']].map(([v, label], i) =>
      el('button', { class: i === 0 ? 'on' : '', onClick: (e) => { repeat = v; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); dayPick.style.display = v === 'weekdays' ? '' : 'none'; } }, label)));

  const dayPick = el('div', { class: 'chiprow', style: 'display:none;margin-top:8px' },
    ...DOW.map((d, i) => el('button', { class: 'chipbtn', onClick: (e) => {
      const n = DOW_NUM[i];
      if (days.includes(n)) { days = days.filter((x) => x !== n); e.target.classList.remove('on'); }
      else { days.push(n); e.target.classList.add('on'); }
    } }, d)));

  function submit() {
    const t = title.value.trim();
    if (!t) { toast('Type a task first'); return; }
    const tm = timeToMin(time.value) != null ? time.value.trim() : null;
    if (repeat === 'once') {
      update((d) => { d.tasks.push({ id: uid(), title: t, date: selectedDay, time: tm, project: null, done: false, order: (d.tasks.filter((x) => x.date === selectedDay).length), createdAt: new Date().toISOString(), completedAt: null }); });
    } else if (repeat === 'daily') {
      update((d) => { d.routines.push({ id: uid(), title: t, time: tm, freq: 'daily', project: null }); });
    } else {
      if (!days.length) { toast('Pick at least one day'); return; }
      update((d) => { d.routines.push({ id: uid(), title: t, time: tm, freq: { days: [...days] }, project: null }); });
    }
    title.value = ''; time.value = '';
    toast(repeat === 'once' ? 'Task added' : 'Repeating task added'); rerender();
  }
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return el('div', { class: 'card' },
    el('div', { class: 'inline-form' }, title, el('button', { class: 'btn btn--primary', onClick: submit }, 'Add')),
    el('div', { class: 'rowflex', style: 'margin-top:10px' }, time, seg),
    dayPick);
}

// ---------- one day's list ----------
function dayCard(rerender) {
  const d = getData();
  const key = selectedDay;
  const items = tasksForDay(d, key);
  const done = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done);

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, key === todayKey() ? 'Today' : prettyDate(keyToDate(key))),
    items.length ? el('span', { class: 'chip' + (done === items.length ? ' chip--key' : '') }, `${done}/${items.length}`) : null));

  if (next && key === todayKey()) card.append(el('div', { class: 'banner banner--gold', style: 'margin-bottom:12px' }, `▶ Next up: ${next.time ? next.time + ' · ' : ''}${next.title}`));

  if (!items.length) card.append(el('div', { class: 'empty muted' }, 'Nothing planned. Add tasks below, or copy yesterday.'));

  const untimed = items.filter((i) => timeToMin(i.time) == null && i.kind === 'task');
  items.forEach((it) => {
    if (editingId === it.id && it.kind === 'task') { card.append(editRow(it, rerender)); return; }
    const uidx = untimed.indexOf(it);
    card.append(el('div', { class: 'row' + (it.done ? ' done' : '') },
      el('button', { class: 'check' + (it.done ? ' on' : ''), 'aria-label': 'Tick', onClick: () => { toggleTaskItem(it, key); rerender(); } }),
      el('div', { class: 'row__main' },
        el('div', { class: 'row__name' }, it.time ? el('span', { class: 'chip', style: 'margin-right:8px' }, it.time) : null, it.title),
        it.kind === 'routine' ? el('div', { class: 'row__meta' }, el('span', { class: 'chip chip--tag' }, '↻ repeats')) : null),
      // reorder untimed one-offs
      (it.kind === 'task' && timeToMin(it.time) == null && uidx > 0) ? el('button', { class: 'btn btn--icon', title: 'Up', onClick: () => { reorderUntimed(key, uidx, -1); rerender(); } }, '↑') : null,
      (it.kind === 'task' && timeToMin(it.time) == null && uidx < untimed.length - 1) ? el('button', { class: 'btn btn--icon', title: 'Down', onClick: () => { reorderUntimed(key, uidx, 1); rerender(); } }, '↓') : null,
      it.kind === 'task' ? el('button', { class: 'btn btn--icon', title: 'Edit', onClick: () => { editingId = it.id; rerender(); } }, '✎') : null,
      it.kind === 'task'
        ? el('button', { class: 'btn btn--icon', title: 'Delete', onClick: () => { update((x) => { x.tasks = x.tasks.filter((a) => a.id !== it.id); }); rerender(); } }, '×')
        : el('button', { class: 'btn btn--icon', title: 'Skip repeats — edit in Repeating tasks', onClick: () => { showRoutines = true; rerender(); } }, '⚙')));
  });

  // copy previous day's unfinished one-offs
  const prevKey = addDays(key, -1);
  const carry = d.tasks.filter((t) => t.date === prevKey && !t.done);
  if (carry.length) card.append(el('button', { class: 'btn btn--ghost btn--full', style: 'margin-top:10px', onClick: () => {
    update((x) => { carry.forEach((t, i) => x.tasks.push({ id: uid(), title: t.title, date: key, time: t.time, project: t.project, done: false, order: 1000 + i, createdAt: new Date().toISOString(), completedAt: null })); });
    toast(`Copied ${carry.length} from yesterday`); rerender();
  } }, `↩ Copy yesterday’s ${carry.length} unfinished`));
  return card;
}

function reorderUntimed(key, uidx, dir) {
  update((d) => {
    const list = tasksForDay(d, key).filter((i) => timeToMin(i.time) == null && i.kind === 'task');
    const a = list[uidx], b = list[uidx + dir];
    if (!a || !b) return;
    const ta = d.tasks.find((x) => x.id === a.id), tb = d.tasks.find((x) => x.id === b.id);
    const tmp = ta.order || 0; ta.order = tb.order || 0; tb.order = tmp;
  });
}

function editRow(it, rerender) {
  const title = el('input', { type: 'text', value: it.title, maxlength: '120' });
  const time = el('input', { type: 'text', value: it.time || '', placeholder: 'time', maxlength: '5', style: 'max-width:90px', inputmode: 'numeric' });
  const save = () => {
    const t = title.value.trim(); if (!t) { toast('Needs a title'); return; }
    update((d) => { const task = d.tasks.find((x) => x.id === it.id); task.title = t; task.time = timeToMin(time.value) != null ? time.value.trim() : null; });
    editingId = null; rerender();
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editingId = null; rerender(); } });
  return el('div', { class: 'row' }, el('div', { class: 'row__main' }, el('div', { class: 'rowflex' }, title, time)),
    el('button', { class: 'btn btn--sm btn--primary', onClick: save }, 'Save'),
    el('button', { class: 'btn btn--icon', onClick: () => { editingId = null; rerender(); } }, '×'));
}

// ---------- backlog (undated / longer-term) ----------
function backlogCard(rerender) {
  const d = getData();
  const items = d.tasks.filter((t) => !t.date);
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '📌 Backlog / longer-term'), el('span', { class: 'card__sub' }, 'no fixed day')));

  items.forEach((t) => card.append(el('div', { class: 'row' + (t.done ? ' done' : '') },
    el('button', { class: 'check' + (t.done ? ' on' : ''), onClick: () => { update((x) => { const tt = x.tasks.find((a) => a.id === t.id); tt.done = !tt.done; }); rerender(); } }),
    el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, t.title)),
    el('button', { class: 'btn btn--icon', title: 'Move to selected day', onClick: () => { update((x) => { x.tasks.find((a) => a.id === t.id).date = selectedDay; }); toast('Scheduled'); rerender(); } }, '📅'),
    el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.tasks = x.tasks.filter((a) => a.id !== t.id); }); rerender(); } }, '×'))));

  const input = el('input', { type: 'text', placeholder: 'Add a longer-term task…', maxlength: '120' });
  const add = () => { const v = input.value.trim(); if (!v) return; update((x) => { x.tasks.push({ id: uid(), title: v, date: null, time: null, project: null, done: false, order: 0, createdAt: new Date().toISOString(), completedAt: null }); }); input.value = ''; rerender(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  card.append(el('div', { class: 'inline-form', style: 'margin-top:10px' }, input, el('button', { class: 'btn', onClick: add }, 'Add')));
  return card;
}

// ---------- routines management ----------
function routinesCard(rerender) {
  const d = getData();
  const body = el('div', { class: 'collapse__body' + (showRoutines ? ' open' : '') });
  d.routines.forEach((r) => {
    const label = r.freq === 'daily' ? 'daily' : (r.freq.days || []).map((n) => DOW[DOW_NUM.indexOf(n)]).join(' ');
    body.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, (r.time ? r.time + ' · ' : '') + r.title), el('div', { class: 'row__meta' }, '↻ ' + label)),
      el('button', { class: 'btn btn--icon', title: 'Delete routine', onClick: () => { if (confirmAction(`Delete repeating task "${r.title}"?`)) { update((x) => { x.routines = x.routines.filter((a) => a.id !== r.id); }); rerender(); } } }, '×')));
  });
  if (!d.routines.length) body.append(el('div', { class: 'empty muted' }, 'No repeating tasks yet. Add one above with “Daily” or “Pick days”.'));

  const head = el('button', { class: 'collapse__head', onClick: () => { showRoutines = !showRoutines; body.classList.toggle('open', showRoutines); head.querySelector('.collapse__arrow').textContent = showRoutines ? '▾' : '▸'; } },
    el('span', {}, `↻ Repeating tasks · ${d.routines.length}`), el('span', { class: 'collapse__arrow' }, showRoutines ? '▾' : '▸'));
  return el('div', { class: 'card card--tight' }, head, body);
}

// ---------- day navigation ----------
function dayNav(rerender) {
  return el('div', { class: 'rowflex', style: 'margin-bottom:10px' },
    el('button', { class: 'btn btn--icon', onClick: () => { selectedDay = addDays(selectedDay, -1); rerender(); } }, '‹'),
    el('div', { style: 'flex:1;text-align:center;font-weight:700' }, selectedDay === todayKey() ? 'Today' : prettyDate(keyToDate(selectedDay))),
    el('button', { class: 'btn btn--icon', onClick: () => { selectedDay = addDays(selectedDay, 1); rerender(); } }, '›'),
    selectedDay !== todayKey() ? el('button', { class: 'btn btn--sm', onClick: () => { selectedDay = todayKey(); rerender(); } }, 'Today') : null);
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Tasks'));
  view.append(dayNav(rerender));
  view.append(dayCard(rerender));
  view.append(addForm(rerender));
  view.append(routinesCard(rerender));
  view.append(backlogCard(rerender));
}

export default { render };
