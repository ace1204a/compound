// ============================================================
// Habits — daily / x-per-week / COUNTER habits with FORGIVING
// streaks. Habits can carry a time-of-day (morning/day/evening)
// and a target (e.g. water 3 = tap +1 three times to complete).
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, weekStartKey, confirmAction } from '../ui.js';

export const TIME_GROUPS = [['morning', '🌅 Morning'], ['day', '☀️ Daytime'], ['evening', '🌙 Evening'], ['', '📌 Anytime']];

// ---------- completion helpers (support counter habits) ----------
export function habitCount(h, key) { const v = (h.log || {})[key]; return typeof v === 'number' ? v : (v ? 1 : 0); }
export function habitTarget(h) { return Math.max(1, +h.target || 1); }
export function dayComplete(h, key) { const t = habitTarget(h); return t > 1 ? habitCount(h, key) >= t : !!(h.log && h.log[key]); }
export function isDoneOn(h, key) { return dayComplete(h, key); }
export function isDoneToday(h) { return dayComplete(h, todayKey()); }

/** current + best consecutive-day streak (a day counts once it's COMPLETE). */
export function computeStreaks(habit) {
  const log = habit.log || {};
  let cursor = todayKey();
  if (!dayComplete(habit, cursor)) cursor = addDays(cursor, -1);
  let current = 0;
  while (dayComplete(habit, cursor)) { current++; cursor = addDays(cursor, -1); }

  const days = Object.keys(log).filter((k) => dayComplete(habit, k)).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) { run = (prev && addDays(prev, 1) === k) ? run + 1 : 1; if (run > best) best = run; prev = k; }
  return { current, best: Math.max(best, current) };
}

export function weekCount(habit) {
  const start = weekStartKey();
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((k) => dayComplete(habit, k)).length;
}

/** Tap a habit for a day: toggle simple habits, +1 (then reset) for counters. */
export function tapHabit(habitId, key) {
  update((d) => {
    const h = d.habits.find((x) => x.id === habitId);
    if (!h) return;
    h.log = h.log || {};
    const t = habitTarget(h);
    if (t <= 1) { if (h.log[key]) delete h.log[key]; else h.log[key] = true; return; }
    const c = habitCount(h, key);
    if (c >= t) delete h.log[key];            // full → tap resets
    else h.log[key] = c + 1;                  // otherwise +1
  });
}
export function toggleHabitOn(habitId, key) { tapHabit(habitId, key); }
export function toggleToday(habitId) { tapHabit(habitId, todayKey()); }

/** Counter habits: step the count by +1/-1, clamped 0..target (no reset, no overshoot). */
export function stepHabit(habitId, key, delta) {
  update((d) => {
    const h = d.habits.find((x) => x.id === habitId);
    if (!h) return;
    h.log = h.log || {};
    const t = habitTarget(h);
    const v = Math.max(0, Math.min(t, habitCount(h, key) + delta));
    if (v === 0) delete h.log[key]; else h.log[key] = v;
  });
}

/** The left-hand control: a single check for simple habits, a −/+ stepper for counters. */
export function checkControl(h, key, rerender) {
  const target = habitTarget(h);
  const done = dayComplete(h, key);
  if (target <= 1) {
    return el('button', { class: 'check' + (h.keystone ? ' check--gold' : '') + (done ? ' on' : ''), 'aria-label': 'Tick ' + h.name, onClick: () => { tapHabit(h.id, key); rerender(); } });
  }
  // check first (so it aligns with every other habit's check), minus to its right
  return el('div', { class: 'stepper' },
    el('button', { class: 'check check--gold' + (done ? ' on' : ''), 'aria-label': 'plus', onClick: () => { stepHabit(h.id, key, 1); rerender(); } }, done ? null : '+'),
    el('button', { class: 'btn btn--icon stepper__minus', 'aria-label': 'minus', onClick: () => { stepHabit(h.id, key, -1); rerender(); } }, '−'));
}

export function dotStrip(habit) {
  const start = addDays(todayKey(), -6);
  const wrap = el('span', { class: 'dots' });
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    const cls = 'dot' + (dayComplete(habit, k) ? ' on' : '') + (k === todayKey() ? ' today' : '');
    wrap.append(el('span', { class: cls, title: k }));
  }
  return wrap;
}

function cadenceLabel(h) {
  if (h.cadence && h.cadence.perWeek) return `${weekCount(h)}/${h.cadence.perWeek} this week`;
  return 'Daily';
}

// ---------- the tickable line (shared shape) ----------
export function habitLine(h, key, rerender, { compact = false } = {}) {
  const { current } = computeStreaks(h);
  const target = habitTarget(h);
  const count = habitCount(h, key);
  const done = dayComplete(h, key);
  const tier = current >= 30 ? ' chip--t30' : current >= 7 ? ' chip--t7' : '';

  const meta = el('div', { class: 'row__meta' },
    target > 1 ? el('span', { class: 'chip' + (done ? ' chip--key' : '') }, `${count}/${target}${h.unit ? h.unit : ''}`) : null,
    current > 0 ? el('span', { class: 'chip chip--streak' + tier }, `🔥 ${current}`) : null,
    (!compact && h.cadence && h.cadence.perWeek) ? el('span', { class: 'chip' }, cadenceLabel(h)) : null,
    (!compact && h.keystone) ? el('span', { class: 'chip chip--key' }, '★') : null);

  return el('div', { class: 'row' + (done ? ' done' : '') },
    checkControl(h, key, rerender),
    el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, h.name), meta),
    !compact ? el('div', { style: 'margin-top:0' }, dotStrip(h)) : null);
}

// ---------- editor ----------
let editingId = null;
function editor(h, rerender) {
  const name = el('input', { type: 'text', value: h.name, maxlength: '60' });
  let cadence = h.cadence && h.cadence.perWeek ? 'weekly' : 'daily';
  let perWeek = (h.cadence && h.cadence.perWeek) || 3;
  let time = h.time || '';
  let target = habitTarget(h);

  const cadenceSeg = seg([['daily', 'Daily'], ['weekly', 'X / week']], cadence, (v) => { cadence = v; pw.style.display = v === 'weekly' ? '' : 'none'; });
  const pw = el('div', { class: 'field', style: 'display:' + (cadence === 'weekly' ? '' : 'none') + ';margin-top:8px' },
    el('span', {}, 'Times per week'), el('input', { type: 'number', min: '1', max: '7', value: perWeek, onInput: (e) => { perWeek = Math.max(1, Math.min(7, +e.target.value || 3)); } }));

  const timeSeg = seg(TIME_GROUPS.map(([v, l]) => [v, l.replace(/^\S+\s/, '')]), time, (v) => { time = v; });

  const unit = el('input', { type: 'text', value: h.unit || '', placeholder: 'unit (e.g. L, glasses)', maxlength: '8', style: 'max-width:150px' });
  const targetIn = el('input', { type: 'number', min: '1', max: '20', value: target, style: 'max-width:90px', onInput: (e) => { target = Math.max(1, +e.target.value || 1); } });

  function save() {
    const n = name.value.trim(); if (!n) { toast('Needs a name'); return; }
    update((d) => {
      const x = d.habits.find((a) => a.id === h.id);
      x.name = n;
      x.cadence = cadence === 'daily' ? 'daily' : { perWeek };
      x.time = time || null;
      x.target = target;
      x.unit = unit.value.trim();
    });
    editingId = null; toast('Saved'); rerender();
  }

  return el('div', { class: 'card card--accent' },
    el('div', { class: 'field' }, el('span', {}, 'Name'), name),
    el('div', { class: 'field' }, el('span', {}, 'How often'), cadenceSeg), pw,
    el('div', { class: 'field', style: 'margin-top:8px' }, el('span', {}, 'Time of day'), timeSeg),
    el('div', { class: 'field', style: 'margin-top:8px' }, el('span', {}, 'Target per day (set >1 for a counter like water)'),
      el('div', { class: 'rowflex' }, targetIn, unit)),
    el('div', { class: 'rowflex', style: 'margin-top:6px' },
      el('button', { class: 'btn btn--primary', onClick: save }, 'Save'),
      el('button', { class: 'btn', onClick: () => { editingId = null; rerender(); } }, 'Cancel'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--danger', onClick: () => { if (confirmAction(`Delete "${h.name}"? History goes too.`)) { update((d) => { d.habits = d.habits.filter((a) => a.id !== h.id); }); editingId = null; rerender(); } } }, 'Delete')));
}

function seg(options, current, onPick) {
  const s = el('div', { class: 'seg', style: 'flex-wrap:wrap' });
  options.forEach(([v, label]) => s.append(el('button', { class: v === current ? 'on' : '', onClick: (e) => { onPick(v); s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); } }, label)));
  return s;
}

function reorderInGroup(h, dir) {
  update((d) => {
    const group = d.habits.filter((x) => (x.time || '') === (h.time || ''));
    group.sort((a, b) => (a.order || 0) - (b.order || 0));
    group.forEach((g, i) => { d.habits.find((x) => x.id === g.id).order = i; }); // normalise
    const idx = group.findIndex((x) => x.id === h.id);
    const j = idx + dir;
    if (j < 0 || j >= group.length) return;
    const A = d.habits.find((x) => x.id === group[idx].id), B = d.habits.find((x) => x.id === group[j].id);
    const tmp = A.order; A.order = B.order; B.order = tmp;
  });
}

function fullRow(h, rerender, pos) {
  if (editingId === h.id) return editor(h, rerender);
  const line = habitLine(h, todayKey(), rerender);
  // fixed-width reorder slots so nothing shifts (and no "null" from empty arrows)
  const up = el('button', { class: 'btn btn--icon', title: 'Up', disabled: pos.i === 0 ? '' : null, onClick: () => { if (pos.i > 0) { reorderInGroup(h, -1); rerender(); } } }, '↑');
  const down = el('button', { class: 'btn btn--icon', title: 'Down', disabled: pos.i === pos.n - 1 ? '' : null, onClick: () => { if (pos.i < pos.n - 1) { reorderInGroup(h, 1); rerender(); } } }, '↓');
  const star = el('button', { class: 'btn btn--icon', title: h.keystone ? 'Unmark ★' : 'Mark ★ non-negotiable', onClick: () => { update((d) => { const x = d.habits.find((a) => a.id === h.id); x.keystone = !x.keystone; }); rerender(); } }, h.keystone ? '★' : '☆');
  const edit = el('button', { class: 'btn btn--icon', title: 'Edit', onClick: () => { editingId = h.id; rerender(); } }, '✎');
  [up, down, star, edit].forEach((n) => line.append(n));
  return line;
}

function addForm(rerender) {
  const name = el('input', { type: 'text', placeholder: 'New habit — e.g. Read 10 pages', maxlength: '60' });
  function submit() {
    const n = name.value.trim(); if (!n) { toast('Give the habit a name'); return; }
    update((d) => { d.habits.push({ id: uid(), name: n, cadence: 'daily', keystone: false, time: null, target: 1, unit: '', createdAt: new Date().toISOString(), log: {} }); });
    name.value = ''; toast('Habit added — tap ✎ to set time/target'); rerender();
  }
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return el('div', { class: 'card' }, el('div', { class: 'inline-form' }, name, el('button', { class: 'btn btn--primary', onClick: submit }, 'Add')),
    el('div', { class: 'hint' }, 'Tip: ✎ to set a time of day, mark ★ non-negotiable, or make it a counter (water 3L).'));
}

function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Habits'));
  view.append(addForm(rerender));

  if (!d.habits.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '🌱'), el('div', {}, 'No habits yet. Add your first above.')));
    return;
  }

  // group by time of day (ordered within each group)
  for (const [val, label] of TIME_GROUPS) {
    const group = d.habits.filter((h) => (h.time || '') === val).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!group.length) continue;
    view.append(el('div', { class: 'section-title' }, label));
    const c = el('div', { class: 'card' });
    group.forEach((h, i) => c.append(fullRow(h, rerender, { i, n: group.length })));
    view.append(c);
  }
  window.scrollTo(0, y);
}

export default { render };
