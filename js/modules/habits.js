// ============================================================
// Habits — daily / x-per-week habits with FORGIVING streaks.
// Design choice (built around Ahmed's "write-off reflex"):
//  - current streak counts up to today OR yesterday, so it
//    never shows 0 just because today isn't ticked yet.
//  - a slip doesn't shame you; "best" streak is always kept.
//  - "keystone" habits are the non-negotiable minimum — the
//    never-zero core that shows in the header score.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, weekStartKey, confirmAction } from '../ui.js';

/** current + best consecutive-day streak from a habit's log. */
export function computeStreaks(habit) {
  const log = habit.log || {};
  let cursor = todayKey();
  if (!log[cursor]) cursor = addDays(cursor, -1); // allow the streak to end yesterday
  let current = 0;
  while (log[cursor]) { current++; cursor = addDays(cursor, -1); }

  const days = Object.keys(log).filter((k) => log[k]).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    run = (prev && addDays(prev, 1) === k) ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return { current, best: Math.max(best, current) };
}

/** number of times ticked in the current Mon–Sun week. */
export function weekCount(habit) {
  const start = weekStartKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return days.filter((k) => habit.log && habit.log[k]).length;
}

export function isDoneToday(habit) { return !!(habit.log && habit.log[todayKey()]); }

export function toggleToday(habitId) {
  update((d) => {
    const h = d.habits.find((x) => x.id === habitId);
    if (!h) return;
    h.log = h.log || {};
    const k = todayKey();
    if (h.log[k]) delete h.log[k]; else h.log[k] = true;
  });
}

/** last-7-days dot strip. */
export function dotStrip(habit) {
  const start = addDays(todayKey(), -6);
  const wrap = el('span', { class: 'dots' });
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    const on = habit.log && habit.log[k];
    const cls = 'dot' + (on ? ' on' : '') + (k === todayKey() ? ' today' : '');
    wrap.append(el('span', { class: cls, title: k }));
  }
  return wrap;
}

function cadenceLabel(h) {
  if (h.cadence === 'daily') return 'Daily';
  if (h.cadence && h.cadence.perWeek) return `${weekCount(h)}/${h.cadence.perWeek} this week`;
  return 'Daily';
}

function habitRow(h, rerender) {
  const { current, best } = computeStreaks(h);
  const done = isDoneToday(h);

  const meta = el('div', { class: 'row__meta' },
    cadenceLabel(h),
    current > 0 ? el('span', { class: 'chip chip--streak' }, `🔥 ${current}`) : null,
    best > 0 ? el('span', { class: 'chip chip--best' }, `best ${best}`) : null,
    h.keystone ? el('span', { class: 'chip chip--key' }, 'non-negotiable') : null,
  );

  return el('div', { class: 'row' + (done ? ' done' : '') },
    el('button', {
      class: 'check' + (h.keystone ? ' check--gold' : '') + (done ? ' on' : ''),
      'aria-label': 'Tick ' + h.name,
      onClick: () => { toggleToday(h.id); rerender(); },
    }),
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, h.name),
      meta,
      el('div', { style: 'margin-top:7px' }, dotStrip(h)),
    ),
    el('button', {
      class: 'btn btn--icon', title: h.keystone ? 'Unmark non-negotiable' : 'Mark as non-negotiable',
      onClick: () => { update((d) => { const x = d.habits.find((a) => a.id === h.id); x.keystone = !x.keystone; }); rerender(); },
    }, h.keystone ? '★' : '☆'),
    el('button', {
      class: 'btn btn--icon', title: 'Delete habit',
      onClick: () => { if (confirmAction(`Delete "${h.name}"? Its history goes too.`)) { update((d) => { d.habits = d.habits.filter((a) => a.id !== h.id); }); rerender(); } },
    }, '×'),
  );
}

function addForm(rerender) {
  let cadence = 'daily';
  let perWeek = 3;

  const name = el('input', { type: 'text', placeholder: 'New habit — e.g. Read 10 pages', maxlength: '60' });

  const seg = el('div', { class: 'seg' },
    el('button', { class: 'on', onClick: (e) => { cadence = 'daily'; setSeg(e.target); pw.style.display = 'none'; } }, 'Daily'),
    el('button', { onClick: (e) => { cadence = 'weekly'; setSeg(e.target); pw.style.display = ''; } }, 'X / week'),
  );
  function setSeg(btn) { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn)); }

  const pw = el('div', { class: 'field', style: 'display:none;margin-top:10px' },
    el('span', {}, 'Times per week'),
    el('input', { type: 'number', min: '1', max: '7', value: '3', onInput: (e) => { perWeek = Math.max(1, Math.min(7, +e.target.value || 3)); } }),
  );

  function submit() {
    const n = name.value.trim();
    if (!n) { toast('Give the habit a name'); return; }
    update((d) => {
      d.habits.push({
        id: uid(), name: n,
        cadence: cadence === 'daily' ? 'daily' : { perWeek },
        keystone: false, createdAt: new Date().toISOString(), log: {},
      });
    });
    toast('Habit added');
    rerender();
  }
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return el('div', { class: 'card' },
    el('div', { class: 'inline-form' }, name, el('button', { class: 'btn btn--primary', onClick: submit }, 'Add')),
    el('div', { style: 'margin-top:10px' }, seg),
    pw,
    el('div', { class: 'hint' }, 'Tip: mark your 2–3 make-or-break habits as ★ non-negotiable. Those are your "never-zero" minimum.'),
  );
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();

  view.append(el('div', { class: 'section-title' }, 'Habits'));
  view.append(addForm(rerender));

  const d = getData();
  if (d.habits.length === 0) {
    view.append(el('div', { class: 'card empty' },
      el('span', { class: 'empty__emoji' }, '🌱'),
      el('div', {}, 'No habits yet. Add your first above.'),
      el('div', { class: 'hint' }, 'Small reps, compounded. Start with one you can’t fail.')));
    return;
  }

  const keys = d.habits.filter((h) => h.keystone);
  const rest = d.habits.filter((h) => !h.keystone);

  if (keys.length) {
    view.append(el('div', { class: 'section-title' }, '★ Non-negotiables'));
    const c = el('div', { class: 'card card--accent' });
    keys.forEach((h) => c.append(habitRow(h, rerender)));
    view.append(c);
  }
  view.append(el('div', { class: 'section-title' }, keys.length ? 'Other habits' : 'All habits'));
  const c2 = el('div', { class: 'card' });
  rest.forEach((h) => c2.append(habitRow(h, rerender)));
  if (!rest.length) c2.append(el('div', { class: 'empty muted' }, 'Everything here is a non-negotiable. Respect.'));
  view.append(c2);
}

export default { render };
