// ============================================================
// Today — the home screen and the heart of the app.
//  - non-negotiables first (never-zero)
//  - today's habits + today's tasks, ticked in place
//  - the 30-second evening check-in that CATCHES a bad day
//    the same night instead of writing off the week.
// ============================================================

import { getData, update } from '../store.js';
import { el, toast, todayKey, keyToDate } from '../ui.js';
import { computeStreaks, isDoneToday, toggleToday } from './habits.js';
import { toggleTask } from './tasks.js';

const LINES = [
  'Small reps, compounded.',
  'A bad day is data, not a write-off.',
  'You don’t need a perfect day. You need a non-zero one.',
  'The boring deposit beats the big gamble.',
  'Show up. That’s the whole edge.',
  'Discipline is remembering what you actually want.',
];

function greeting() {
  const h = new Date().getHours();
  const name = getData().settings.name || '';
  if (h < 5) return `Still up, ${name}?`;
  if (h < 12) return `Morning, ${name}.`;
  if (h < 18) return `Afternoon, ${name}.`;
  return `Evening, ${name}.`;
}

function hero() {
  const line = LINES[keyToDate(todayKey()).getDate() % LINES.length];
  return el('div', { class: 'card card--accent hero' },
    el('div', { class: 'hero__greet' }, greeting()),
    el('div', { class: 'hero__line' }, line),
  );
}

function habitLine(h, rerender) {
  const { current } = computeStreaks(h);
  const done = isDoneToday(h);
  return el('div', { class: 'row' + (done ? ' done' : '') },
    el('button', { class: 'check' + (h.keystone ? ' check--gold' : '') + (done ? ' on' : ''), 'aria-label': 'Tick ' + h.name, onClick: () => { toggleToday(h.id); rerender(); } }),
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, h.name),
      current > 0 ? el('div', { class: 'row__meta' }, el('span', { class: 'chip chip--streak' }, `🔥 ${current}`)) : null,
    ),
  );
}

function taskLine(t, rerender) {
  return el('div', { class: 'row' + (t.done ? ' done' : '') },
    el('button', { class: 'check' + (t.done ? ' on' : ''), 'aria-label': 'Complete', onClick: () => { toggleTask(t.id); rerender(); } }),
    el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, t.title)),
  );
}

// ---------- Evening check-in ----------
function checkinCard(rerender) {
  const d = getData();
  const key = todayKey();
  const existing = d.checkins[key];

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '🌙 Evening check-in'),
    existing ? el('span', { class: 'chip chip--key' }, 'done') : el('span', { class: 'card__sub' }, '30 seconds')));

  let rating = existing ? existing.rating : 0;
  const ratingWrap = el('div', { class: 'rating' });
  function paintRating() {
    ratingWrap.className = 'rating' + (rating && rating <= 4 ? ' rating--low' : '');
    ratingWrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i + 1 <= rating && (i + 1 === rating)));
    // highlight only the chosen number
    ratingWrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i + 1 === rating));
  }
  for (let i = 1; i <= 10; i++) ratingWrap.append(el('button', { onClick: () => { rating = i; paintRating(); reflectLow(); } }, i));

  const win = el('textarea', { placeholder: 'One win today (anything counts)…' }, );
  const lesson = el('textarea', { placeholder: 'One lesson / one thing to fix tomorrow…' });
  if (existing) { win.value = existing.win || ''; lesson.value = existing.lesson || ''; }

  const lowNote = el('div', { class: 'banner banner--warn', style: 'display:none' },
    'Rough day — noted, not written off. Tomorrow is a fresh non-zero day. What’s the one non-negotiable you’ll still hit?');
  function reflectLow() { lowNote.style.display = rating && rating <= 4 ? '' : 'none'; }

  const save = el('button', { class: 'btn btn--primary btn--full', onClick: () => {
    if (!rating) { toast('Pick a rating 1–10'); return; }
    update((data) => { data.checkins[key] = { rating, win: win.value.trim(), lesson: lesson.value.trim(), updatedAt: new Date().toISOString() }; });
    toast(existing ? 'Check-in updated' : 'Logged. See you tomorrow.');
    rerender();
  } }, existing ? 'Update check-in' : 'Save check-in');

  card.append(
    el('div', { class: 'field' }, el('span', {}, 'How was today? (1–10)'), ratingWrap),
    lowNote,
    el('div', { class: 'field' }, el('span', {}, 'Win'), win),
    el('div', { class: 'field' }, el('span', {}, 'Lesson'), lesson),
    save,
  );
  paintRating(); reflectLow();
  return card;
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(hero());

  // Non-negotiables (never-zero)
  const keystones = d.habits.filter((h) => h.keystone);
  if (keystones.length) {
    const doneCount = keystones.filter(isDoneToday).length;
    view.append(el('div', { class: 'section-title' }, '★ Non-negotiables'));
    if (doneCount === keystones.length) view.append(el('div', { class: 'banner' }, '✅ You didn’t zero today. That’s the whole game — a chain that never breaks.'));
    const c = el('div', { class: 'card card--accent' });
    keystones.forEach((h) => c.append(habitLine(h, rerender)));
    view.append(c);
  }

  // Today's habits (non-keystone)
  const others = d.habits.filter((h) => !h.keystone);
  view.append(el('div', { class: 'section-title' }, 'Today’s habits'));
  if (!d.habits.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '🌱'), el('div', {}, 'No habits yet.'),
      el('button', { class: 'btn btn--primary', style: 'margin-top:12px', onClick: () => { location.hash = '/habits'; } }, 'Add your first habit')));
  } else if (!others.length) {
    view.append(el('div', { class: 'card empty muted' }, 'All your habits are non-negotiables above.'));
  } else {
    const c = el('div', { class: 'card' });
    others.forEach((h) => c.append(habitLine(h, rerender)));
    view.append(c);
  }

  // Today's tasks
  const todayTasks = d.tasks.filter((t) => t.bucket === 'today');
  view.append(el('div', { class: 'section-title' }, 'Today’s tasks'));
  if (!todayTasks.length) {
    view.append(el('div', { class: 'card empty muted' }, 'Nothing on today’s list. Add tasks in the Tasks tab.'));
  } else {
    const c = el('div', { class: 'card' });
    todayTasks.sort((a, b) => (a.done === b.done) ? 0 : a.done ? 1 : -1).forEach((t) => c.append(taskLine(t, rerender)));
    view.append(c);
  }

  // Evening check-in
  view.append(el('div', { class: 'section-title' }, 'Reflect'));
  view.append(checkinCard(rerender));
}

export default { render };
