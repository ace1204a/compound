// ============================================================
// Diet — your own rules, ticked daily. A "clean day" = all
// rules ticked. Clean-day streak works like habit streaks
// (forgiving: counts up to today or yesterday).
// Plus a bodyweight log with a mini trend line.
// ============================================================

import { getData, update, uid } from '../store.js';
import { toggleHabitOn } from './habits.js';
import { el, toast, todayKey, addDays, confirmAction, restoreScroll } from '../ui.js';

function isCleanDay(d, dateKey) {
  if (!d.diet.checklist.length) return false;
  const day = d.diet.log[dateKey] || {};
  return d.diet.checklist.every((r) => day[r.id]);
}

export function cleanStreak(d) {
  let cursor = todayKey();
  if (!isCleanDay(d, cursor)) cursor = addDays(cursor, -1);
  let n = 0;
  while (isCleanDay(d, cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}

function rulesCard(rerender) {
  const d = getData();
  const key = todayKey();
  const day = d.diet.log[key] || {};
  const doneCount = d.diet.checklist.filter((r) => day[r.id]).length;
  const streak = cleanStreak(d);

  const card = el('div', { class: 'card card--accent' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '🍗 Today’s rules'),
    el('div', { class: 'rowflex' },
      streak > 0 ? el('span', { class: 'chip chip--streak' }, `🔥 ${streak} clean`) : null,
      el('span', { class: 'card__sub' }, `${doneCount}/${d.diet.checklist.length}`))));

  if (!d.diet.checklist.length) card.append(el('div', { class: 'empty muted' }, 'No rules yet — add yours below.'));

  d.diet.checklist.forEach((r) => {
    const on = !!day[r.id];
    card.append(el('div', { class: 'row' + (on ? ' done' : '') },
      el('button', { class: 'check' + (on ? ' on' : ''), onClick: () => {
        update((x) => {
          x.diet.log[key] = x.diet.log[key] || {};
          if (x.diet.log[key][r.id]) delete x.diet.log[key][r.id]; else x.diet.log[key][r.id] = true;
        });
        rerender();
      } }),
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, r.name)),
      el('button', { class: 'btn btn--icon', title: 'Delete rule', onClick: () => { if (confirmAction(`Remove rule "${r.name}"?`)) { update((x) => { x.diet.checklist = x.diet.checklist.filter((a) => a.id !== r.id); }); rerender(); } } }, '×')));
  });

  if (d.diet.checklist.length && doneCount === d.diet.checklist.length) {
    card.append(el('div', { class: 'banner', style: 'margin-top:10px;margin-bottom:0' }, '✅ Clean day. Stack another tomorrow.'));
  }

  const input = el('input', { type: 'text', placeholder: 'Add a rule — e.g. Hit protein target', maxlength: '80' });
  card.append(el('div', { class: 'inline-form', style: 'margin-top:12px' }, input,
    el('button', { class: 'btn', onClick: () => {
      const v = input.value.trim(); if (!v) return;
      update((x) => { x.diet.checklist.push({ id: uid(), name: v }); });
      input.value = ''; rerender();
    } }, 'Add')));
  return card;
}

// ---------- bodyweight ----------
function sparkline(weights) {
  const pts = weights.slice(-30);
  if (pts.length < 2) return null;
  const w = 280, h = 60, pad = 4;
  const vals = pts.map((p) => p.kg);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const points = pts.map((p, i) => `${pad + i * step},${h - pad - ((p.kg - min) / span) * (h - pad * 2)}`).join(' ');
  return el('div', { html:
    `<svg viewBox="0 0 ${w} ${h}" width="100%" height="60" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="#e8b64c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>` });
}

function weightCard(rerender) {
  const d = getData();
  const weights = [...d.diet.weights].sort((a, b) => a.date.localeCompare(b.date));
  const last = weights[weights.length - 1];

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '⚖️ Bodyweight'),
    last ? el('span', { class: 'big-num' }, `${last.kg} kg`) : el('span', { class: 'card__sub' }, 'no entries')));

  const spark = sparkline(weights);
  if (spark) card.append(spark);
  if (weights.length >= 2) {
    const diff = +(weights[weights.length - 1].kg - weights[0].kg).toFixed(1);
    card.append(el('div', { class: 'hint' }, `${weights.length} entries · ${diff > 0 ? '+' : ''}${diff} kg since ${weights[0].date}`));
  }

  const kg = el('input', { type: 'number', placeholder: 'kg', step: '0.1', min: '0', inputmode: 'decimal' });
  const bf = el('input', { type: 'number', placeholder: 'body fat %', step: '0.1', min: '0', inputmode: 'decimal' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, kg, bf,
    el('button', { class: 'btn btn--primary', onClick: () => {
      const v = +kg.value; if (!v) { toast('Enter your weight'); return; }
      update((x) => {
        x.diet.weights = x.diet.weights.filter((a) => a.date !== todayKey());
        x.diet.weights.push({ date: todayKey(), kg: v, bf: +bf.value || null });
      });
      kg.value = ''; bf.value = ''; toast('Logged'); rerender();
    } }, 'Log')));

  // lean mass: the number that actually tells you if the cut is working
  const withBf = weights.filter((w) => w.bf);
  if (withBf.length) {
    const l = withBf[withBf.length - 1];
    const lean = (l.kg * (1 - l.bf / 100)).toFixed(1);
    card.append(el('div', { class: 'row__meta', style: 'margin-top:10px' },
      el('span', { class: 'chip' }, `${l.bf}% body fat`),
      el('span', { class: 'chip chip--key' }, `${lean}kg lean mass`)));
    if (withBf.length > 1) {
      const f = withBf[0];
      const leanFirst = f.kg * (1 - f.bf / 100);
      const dLean = (+lean - leanFirst).toFixed(1);
      card.append(el('div', { class: 'hint' }, `lean mass ${dLean >= 0 ? '+' : ''}${dLean}kg since ${f.date} — holding lean mass while weight drops = the cut is working`));
    }
  }
  return card;
}

// ---------- weekly cut review: 7-day averages, never single days ----------
function avgOf(weights, fromKey, toKey) {
  const inRange = weights.filter((w) => w.date >= fromKey && w.date <= toKey);
  if (!inRange.length) return null;
  return inRange.reduce((n, w) => n + (+w.kg || 0), 0) / inRange.length;
}
function cutReviewCard() {
  const d = getData();
  const weights = [...d.diet.weights].sort((a, b) => a.date.localeCompare(b.date));
  const card = el('div', { class: 'card card--accent' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '⚖️ Weekly cut review'), el('span', { class: 'card__sub' }, '7-day averages only')));

  const thisWeek = avgOf(weights, addDays(todayKey(), -6), todayKey());
  const lastWeek = avgOf(weights, addDays(todayKey(), -13), addDays(todayKey(), -7));

  if (thisWeek == null || lastWeek == null) {
    card.append(el('div', { class: 'empty muted' }, 'Need ~2 weeks of morning weigh-ins to compare. Keep logging daily.'));
    if (thisWeek != null) card.append(el('div', { class: 'row__meta' }, `this week's average: ${thisWeek.toFixed(2)} kg`));
    return card;
  }

  const rate = lastWeek - thisWeek;           // + = losing
  let verdict, cls;
  if (rate >= 0.3 && rate <= 0.7) { verdict = 'On target — change nothing. This is exactly the rate you want.'; cls = 'chip--key'; }
  else if (rate > 0.8) { verdict = 'Losing fast. If this repeats next week, add 100–150 kcal/day.'; cls = 'chip--streak'; }
  else if (rate < 0.25) { verdict = 'Stalling. If this repeats next week, drop 100 kcal/day.'; cls = 'chip--streak'; }
  else { verdict = 'Slightly under target rate — hold and reassess next week.'; cls = ''; }

  card.append(el('div', { class: 'fgrid' },
    el('div', { class: 'ftile' }, el('div', { class: 'ftile__label' }, 'This week avg'), el('div', { class: 'ftile__val' }, thisWeek.toFixed(2) + ' kg')),
    el('div', { class: 'ftile' }, el('div', { class: 'ftile__label' }, 'Last week avg'), el('div', { class: 'ftile__val' }, lastWeek.toFixed(2) + ' kg')),
    el('div', { class: 'ftile' }, el('div', { class: 'ftile__label' }, 'Rate'), el('div', { class: 'ftile__val ' + (rate > 0 ? 'pos' : 'neg') }, (rate > 0 ? '−' : '+') + Math.abs(rate).toFixed(2) + ' kg/wk')),
    el('div', { class: 'ftile' }, el('div', { class: 'ftile__label' }, 'Target'), el('div', { class: 'ftile__val' }, '0.3–0.7'))));
  card.append(el('div', { class: 'banner banner--gold', style: 'margin:12px 0 0' }, verdict));
  card.append(el('div', { class: 'hint' }, 'Two consecutive weeks before changing anything. Body-fat % from the scale is secondary — trust weight trend, waist, photos, gym and running performance.'));
  return card;
}

// ---------- meal prep: rolling portions ----------
function mealPrepCard(rerender) {
  const d = getData();
  const meals = d.diet.meals || [];
  const ready = meals.filter((m) => m.state !== 'eaten');
  const fridge = ready.filter((m) => m.state === 'fridge').length;
  const frozen = ready.filter((m) => m.state === 'frozen').length;
  const needsPrep = ready.length <= 2;

  const card = el('div', { class: 'card' + (needsPrep ? ' card--accent' : '') });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '🧊 Meal prep'),
    el('span', { class: 'chip' + (needsPrep ? '' : ' chip--key') }, `${ready.length} ready`)));
  if (needsPrep) card.append(el('div', { class: 'banner banner--warn', style: 'margin-bottom:10px' }, '🍳 MEAL PREP REQUIRED — cook 4–6 portions at the next evening or day off.'));
  else card.append(el('div', { class: 'row__meta', style: 'margin-bottom:8px' }, el('span', { class: 'chip' }, `${fridge} fridge`), el('span', { class: 'chip' }, `${frozen} frozen`)));

  const CYCLE = { fridge: 'frozen', frozen: 'eaten', eaten: 'fridge' };
  ready.slice(0, 10).forEach((m) => card.append(el('div', { class: 'row' },
    el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, m.name), el('div', { class: 'row__meta' }, 'cooked ' + m.cookedOn)),
    el('button', { class: 'btn btn--sm', title: 'Change state', onClick: () => { update((x) => { const t = x.diet.meals.find((y) => y.id === m.id); t.state = CYCLE[t.state] || 'fridge'; }); rerender(); } },
      m.state === 'fridge' ? '🧊 Fridge' : '❄️ Frozen'),
    el('button', { class: 'btn btn--icon', title: 'Ate it', onClick: () => { update((x) => { x.diet.meals.find((y) => y.id === m.id).state = 'eaten'; }); toast('Enjoy'); rerender(); } }, '🍽'))));

  const name = el('input', { type: 'text', placeholder: 'e.g. Chicken + rice + veg', maxlength: '40' });
  const count = el('input', { type: 'number', value: '6', min: '1', max: '12', style: 'max-width:80px', inputmode: 'numeric' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, name, count,
    el('button', { class: 'btn btn--primary', onClick: () => {
      const n = name.value.trim() || 'Prepped meal';
      const c = Math.max(1, Math.min(12, +count.value || 6));
      update((x) => {
        x.diet.meals = x.diet.meals || [];
        for (let i = 0; i < c; i++) x.diet.meals.push({ id: uid(), name: n, state: i < 3 ? 'fridge' : 'frozen', cookedOn: todayKey() });
      });
      name.value = ''; toast(`${c} portions logged 🧊`); rerender();
    } }, 'Cooked')));
  card.append(el('div', { class: 'hint' }, 'First 3 go in the fridge, the rest frozen. Tap a portion to move fridge ⇄ frozen, or 🍽 when you eat it.'));
  return card;
}


// ---------- intake (numbers come from MyFitnessPal) ----------
// Deliberately NOT a food logger. MyFitnessPal already does that properly;
// duplicating it would just be work. Two numbers a night is enough to make
// the trend readable and to explain a weight move — a tick can't tell 2,400
// from 4,500, and that difference was the whole story of one bad week.
const KCAL_TARGET = 2200, PROTEIN_TARGET = 180;
// iOS shows a numeric keypad for these and won't reject a stray space.
const numInput = (p={}) => el('input', { type: 'number', step: '1', min: '0', inputmode: 'numeric', ...p });
const parseNum = (v) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };

function intakeFor(d, key) { return (d.diet.intake || {})[key] || {}; }

function intakeCard(rerender) {
  const d = getData(), key = todayKey(), today = intakeFor(d, key);
  const card = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, "Today's intake"),
      el('span', { class: 'chip' }, 'from MyFitnessPal')));

  const kcal = numInput({ placeholder: String(KCAL_TARGET), value: today.kcal != null ? today.kcal : '', style: 'max-width:110px' });
  const prot = numInput({ placeholder: String(PROTEIN_TARGET), value: today.protein != null ? today.protein : '', style: 'max-width:110px' });

  // Typing the numbers ticks the habits for you — one place to enter it, not two.
  const save = () => {
    const k = parseNum(kcal.value), p = parseNum(prot.value);
    update((x) => {
      x.diet.intake = x.diet.intake || {};
      if (k == null && p == null) delete x.diet.intake[key];
      else x.diet.intake[key] = { ...(x.diet.intake[key] || {}), kcal: k, protein: p };
    });
    const hit = (name, ok) => {
      const h = getData().habits.find((x) => x.name.toLowerCase().includes(name));
      if (h && !!(h.log || {})[key] !== ok) toggleHabitOn(h.id, key);
    };
    if (k != null) hit('calor', Math.abs(k - KCAL_TARGET) <= 150);
    if (p != null) hit('protein', p >= PROTEIN_TARGET);
    rerender();
  };
  kcal.addEventListener('change', save);
  prot.addEventListener('change', save);

  card.append(el('div', { class: 'rowflex' }, el('span', { class: 'row__name', style: 'flex:1' }, 'Calories'), kcal,
    el('span', { class: 'row__meta' }, 'target ' + KCAL_TARGET)));
  card.append(el('div', { class: 'rowflex', style: 'margin-top:8px' }, el('span', { class: 'row__name', style: 'flex:1' }, 'Protein (g)'), prot,
    el('span', { class: 'row__meta' }, 'target ' + PROTEIN_TARGET)));

  // 7-day averages — the number that actually explains the scale.
  const week = Array.from({ length: 7 }, (_, i) => addDays(key, i - 6)).map((k) => intakeFor(d, k));
  const ks = week.map((x) => x.kcal).filter((n) => typeof n === 'number');
  if (ks.length) {
    const avg = ks.reduce((a, b) => a + b, 0) / ks.length;
    const over = avg - KCAL_TARGET;
    card.append(el('div', { class: 'hint' },
      `7-day average ${Math.round(avg)} kcal from ${ks.length} logged ${ks.length === 1 ? 'day' : 'days'} — ` +
      (Math.abs(over) < 100 ? 'on target.' : (over > 0 ? `${Math.round(over)} over. That is about ${(over * 7 / 7700).toFixed(1)}kg a week in the wrong direction.` : `${Math.round(-over)} under.`))));
  } else {
    card.append(el('div', { class: 'hint' }, 'Copy the two totals across at the end of each day. Nothing else needed.'));
  }
  return card;
}

function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Diet'));
  view.append(rulesCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Intake'));
  view.append(intakeCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Cut review'));
  view.append(cutReviewCard());
  view.append(el('div', { class: 'section-title' }, 'Bodyweight'));
  view.append(weightCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Meal prep'));
  view.append(mealPrepCard(rerender));
  restoreScroll(y);
}

export default { render };
