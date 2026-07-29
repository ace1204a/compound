// ============================================================
// Today / Day — the home screen, now DATE-AWARE.
// A horizontal day slider (Structured/Productive style) lets you
// scroll to any past or future day and view + edit it: habits
// ticked, the daily checklist, and the evening check-in all read
// and write to the selected date.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, keyToDate, addDays, prettyDate } from '../ui.js';
import { computeStreaks, isDoneOn, tapHabit, weekCount, habitCount, habitTarget, TIME_GROUPS } from './habits.js';
import { tasksForDay, toggleTaskItem } from './tasks.js';
import { nowAndNext, dayProgress, isBlockDone, toggleBlock } from './plan.js';

// which day we're looking at (persists while the app is open)
let selectedKey = todayKey();

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

function dayHasActivity(d, key) {
  if (d.checkins[key]) return true;
  if ((d.daily[key] || []).length) return true;
  if (d.plan.done && d.plan.done[key] && Object.keys(d.plan.done[key]).length) return true;
  return d.habits.some((h) => h.log && h.log[key]);
}

// ---------- day slider ----------
function daySlider(rerender) {
  const d = getData();
  const strip = el('div', { class: 'dayslider', id: 'dayslider' });
  for (let i = -35; i <= 7; i++) {
    const key = addDays(todayKey(), i);
    const date = keyToDate(key);
    const sel = key === selectedKey;
    const isToday = key === todayKey();
    const chip = el('button', {
      class: 'daychip' + (sel ? ' on' : '') + (isToday ? ' today' : ''),
      onClick: () => { selectedKey = key; rerender(); },
    },
      el('span', { class: 'daychip__dow' }, date.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3)),
      el('span', { class: 'daychip__num' }, String(date.getDate())),
      dayHasActivity(d, key) && !sel ? el('span', { class: 'daychip__dot' }) : null);
    strip.append(chip);
  }
  // scroll the selected chip into view after render
  setTimeout(() => { const on = document.querySelector('#dayslider .daychip.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
  return strip;
}

function dayNumber() {
  const start = new Date(getData().settings.createdAt || Date.now());
  const days = Math.floor((keyToDate(todayKey()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
  return Math.max(1, days);
}

function hero(key) {
  const isToday = key === todayKey();
  const sleep = getData().plan.sleep;
  if (isToday) {
    const line = LINES[keyToDate(todayKey()).getDate() % LINES.length];
    return el('div', { class: 'card card--accent hero' },
      el('div', { class: 'rowflex' },
        el('div', { class: 'hero__greet' }, greeting()),
        el('span', { class: 'spacer' }),
        el('span', { class: 'chip chip--streak' }, `Day ${dayNumber()}`)),
      el('div', { class: 'hero__line' }, line),
      sleep ? el('div', { class: 'row__meta', style: 'margin-top:8px' },
        el('span', { class: 'chip' }, `🌙 bed ${sleep.bed}`),
        el('span', { class: 'chip' }, `⏰ wake ${sleep.wake}`)) : null);
  }
  const past = keyToDate(key) < keyToDate(todayKey());
  return el('div', { class: 'card hero' },
    el('div', { class: 'hero__greet' }, prettyDate(keyToDate(key))),
    el('div', { class: 'hero__line' }, past ? 'Looking back — tick or edit anything you missed.' : 'Planning ahead — set this day up.'),
    el('button', { class: 'btn btn--sm', style: 'margin-top:10px', onClick: () => { selectedKey = todayKey(); render(document.getElementById('view')); } }, '→ Back to today'));
}

// ---------- NOW / NEXT (today only) ----------
function nowCard(rerender) {
  const d = getData();
  const { current, next } = nowAndNext(d.plan.day);
  if (!current && !next) return null;
  const { done, total } = dayProgress(d);

  const card = el('div', { class: 'card nowcard' });
  if (current) {
    const ticked = isBlockDone(d, current.id);
    card.append(el('div', { class: 'rowflex', style: 'align-items:flex-start' },
      el('button', { class: 'check check--gold' + (ticked ? ' on' : ''), 'aria-label': 'Tick this block', onClick: () => { toggleBlock(current.id); rerender(); } }),
      el('div', { class: 'row__main' },
        el('div', { class: 'nowcard__label' }, `NOW · since ${current.time}`),
        el('div', { class: 'nowcard__title' }, current.title),
        current.detail ? el('div', { class: 'card__sub' }, current.detail) : null)));
  } else {
    card.append(el('div', { class: 'nowcard__label' }, 'DAY NOT STARTED'));
  }
  if (total) card.append(el('div', { class: 'progress', style: 'margin-top:12px' }, el('div', { class: 'progress__fill', style: `width:${(done / total) * 100}%` })));
  card.append(el('div', { class: 'nowcard__next', onClick: () => { location.hash = '/plan'; }, style: 'cursor:pointer' },
    next ? `Next → ${next.time} · ${next.title}${next.tomorrow ? ' (tomorrow)' : ''}` : 'Plan complete',
    total ? el('span', { class: 'spacer' }) : null,
    total ? el('span', { class: 'chip' + (done === total ? ' chip--key' : '') }, `${done}/${total} today`) : null));
  return card;
}

// ---------- daily checklist (for the selected day) ----------
function dailyList(key, rerender) {
  const d = getData();
  const items = d.daily[key] || [];
  const done = items.filter((i) => i.done).length;

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '✅ Checklist'),
    items.length ? el('span', { class: 'chip' + (done === items.length ? ' chip--key' : '') }, `${done}/${items.length}`) : null));

  const input = el('input', { type: 'text', placeholder: 'Add anything — “finish trade review”, “wave at someone”…', maxlength: '100' });
  const add = () => {
    const v = input.value.trim();
    if (!v) return;
    update((x) => { x.daily[key] = x.daily[key] || []; x.daily[key].push({ id: uid(), text: v, done: false }); });
    input.value = ''; rerender(); setTimeout(() => { const n = document.querySelector('#dailyAdd'); if (n) n.focus(); }, 0);
  };
  input.id = 'dailyAdd';
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  card.append(el('div', { class: 'inline-form' }, input, el('button', { class: 'btn btn--primary', onClick: add }, 'Add')));

  items.forEach((it) => {
    card.append(el('div', { class: 'row' + (it.done ? ' done' : '') },
      el('button', { class: 'check' + (it.done ? ' on' : ''), 'aria-label': 'Tick', onClick: () => { update((x) => { const t = (x.daily[key] || []).find((a) => a.id === it.id); if (t) t.done = !t.done; }); rerender(); } }),
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, it.text)),
      el('button', { class: 'btn btn--icon', title: 'Remove', onClick: () => { update((x) => { x.daily[key] = (x.daily[key] || []).filter((a) => a.id !== it.id); }); rerender(); } }, '×')));
  });

  if (!items.length) {
    const carry = (d.daily[addDays(key, -1)] || []).filter((i) => !i.done);
    card.append(el('div', { class: 'empty muted', style: 'padding:14px 6px' }, 'Empty. Build this day’s list — big things and tiny ones.'));
    if (carry.length) card.append(el('button', { class: 'btn btn--ghost btn--full', onClick: () => {
      update((x) => { x.daily[key] = carry.map((i) => ({ id: uid(), text: i.text, done: false })); });
      toast(`Carried over ${carry.length}`); rerender();
    } }, `↩ Copy previous day’s ${carry.length} unfinished`));
  }
  return card;
}

function habitLine(h, key, rerender) {
  const { current } = computeStreaks(h);
  const done = isDoneOn(h, key);
  const tier = current >= 30 ? ' chip--t30' : current >= 7 ? ' chip--t7' : '';
  const weekly = h.cadence && h.cadence.perWeek;
  const target = habitTarget(h), count = habitCount(h, key);
  return el('div', { class: 'row' + (done ? ' done' : '') },
    el('button', { class: 'check' + (h.keystone ? ' check--gold' : '') + (done ? ' on' : ''), 'aria-label': 'Tick ' + h.name, onClick: () => { tapHabit(h.id, key); rerender(); } },
      target > 1 && !done ? el('span', { style: 'font-size:11px;font-weight:800' }, '+') : null),
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, h.name),
      el('div', { class: 'row__meta' },
        target > 1 ? el('span', { class: 'chip' + (done ? ' chip--key' : '') }, `${count}/${target}${h.unit || ''}`) : null,
        current > 0 ? el('span', { class: 'chip chip--streak' + tier }, `🔥 ${current}`) : null,
        weekly ? el('span', { class: 'chip' }, `${weekCount(h)}/${h.cadence.perWeek} wk`) : null)));
}


// ---------- Evening check-in (for the selected day) ----------
function ratingBars() {
  const d = getData();
  const days = Array.from({ length: 7 }, (_, i) => addDays(selectedKey, i - 6));
  const wrap = el('div', { class: 'ratebars', title: '7 days up to this one' });
  for (const k of days) {
    const c = d.checkins[k];
    const r = c ? c.rating : 0;
    const cls = !r ? '' : r <= 4 ? ' bad' : r <= 7 ? ' mid' : ' good';
    wrap.append(el('div', { class: 'ratebar' + cls, style: `height:${Math.max(8, r * 3.2)}px`, title: `${k}: ${r || '—'}` }));
  }
  return wrap;
}

function checkinCard(key, rerender) {
  const d = getData();
  const existing = d.checkins[key];

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '🌙 Check-in'),
    el('div', { class: 'rowflex' }, ratingBars(),
      existing ? el('span', { class: 'chip chip--key' }, 'done') : el('span', { class: 'card__sub' }, '30s'))));

  let rating = existing ? existing.rating : 0;
  const ratingWrap = el('div', { class: 'rating' });
  function paint() { ratingWrap.className = 'rating' + (rating && rating <= 4 ? ' rating--low' : ''); ratingWrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i + 1 === rating)); }
  for (let i = 1; i <= 10; i++) ratingWrap.append(el('button', { onClick: () => { rating = i; paint(); reflectLow(); } }, i));

  const win = el('textarea', { placeholder: 'One win…' });
  const lesson = el('textarea', { placeholder: 'One lesson / one thing to fix tomorrow…' });
  if (existing) { win.value = existing.win || ''; lesson.value = existing.lesson || ''; }

  const lowNote = el('div', { class: 'banner banner--warn', style: 'display:none' }, 'Rough day — noted, not written off. What’s the one non-negotiable you’ll still hit?');
  function reflectLow() { lowNote.style.display = rating && rating <= 4 ? '' : 'none'; }

  const save = el('button', { class: 'btn btn--primary btn--full', onClick: () => {
    if (!rating) { toast('Pick a rating 1–10'); return; }
    update((data) => { data.checkins[key] = { rating, win: win.value.trim(), lesson: lesson.value.trim(), updatedAt: new Date().toISOString() }; });
    toast(existing ? 'Check-in updated' : 'Logged.'); rerender();
  } }, existing ? 'Update check-in' : 'Save check-in');

  card.append(
    el('div', { class: 'field' }, el('span', {}, 'Rate the day (1–10)'), ratingWrap),
    lowNote,
    el('div', { class: 'field' }, el('span', {}, 'Win'), win),
    el('div', { class: 'field' }, el('span', {}, 'Lesson'), lesson),
    save);
  paint(); reflectLow();
  return card;
}

function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();
  const key = selectedKey;
  const isToday = key === todayKey();

  view.append(daySlider(rerender));
  view.append(hero(key));

  if (isToday) { const nc = nowCard(rerender); if (nc) view.append(nc); }

  view.append(el('div', { class: 'section-title' }, 'Checklist'));
  view.append(dailyList(key, rerender));

  // Non-negotiables
  const keystones = d.habits.filter((h) => h.keystone);
  if (keystones.length) {
    const doneCount = keystones.filter((h) => isDoneOn(h, key)).length;
    view.append(el('div', { class: 'section-title' }, '★ Non-negotiables'));
    if (doneCount === keystones.length) view.append(el('div', { class: 'banner' }, '✅ Didn’t zero — a chain that never breaks.'));
    const c = el('div', { class: 'card card--accent' });
    keystones.forEach((h) => c.append(habitLine(h, key, rerender)));
    view.append(c);
  }

  // remaining habits, grouped by time of day
  const others = d.habits.filter((h) => !h.keystone);
  if (!d.habits.length) {
    view.append(el('div', { class: 'section-title' }, 'Habits'));
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '🌱'), el('div', {}, 'No habits yet.'),
      el('button', { class: 'btn btn--primary', style: 'margin-top:12px', onClick: () => { location.hash = '/habits'; } }, 'Add your first habit')));
  } else {
    for (const [val, label] of TIME_GROUPS) {
      const group = others.filter((h) => (h.time || '') === val);
      if (!group.length) continue;
      view.append(el('div', { class: 'section-title' }, label));
      const c = el('div', { class: 'card' });
      group.forEach((h) => c.append(habitLine(h, key, rerender)));
      view.append(c);
    }
  }

  // Today's planned tasks (from the Tasks planner — for the selected day)
  const dayTasks = tasksForDay(d, key);
  if (dayTasks.length) {
    view.append(el('div', { class: 'section-title' }, 'Tasks'));
    const c = el('div', { class: 'card' });
    dayTasks.forEach((it) => c.append(el('div', { class: 'row' + (it.done ? ' done' : '') },
      el('button', { class: 'check' + (it.done ? ' on' : ''), 'aria-label': 'Tick', onClick: () => { toggleTaskItem(it, key); rerender(); } }),
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, it.time ? el('span', { class: 'chip', style: 'margin-right:8px' }, it.time) : null, it.title)))));
    view.append(c);
  }

  view.append(el('div', { class: 'section-title' }, 'Reflect'));
  view.append(checkinCard(key, rerender));
  window.scrollTo(0, y);
}

export default { render };
