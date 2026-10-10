// ============================================================
// Diet — your own rules, ticked daily. A "clean day" = all
// rules ticked. Clean-day streak works like habit streaks
// (forgiving: counts up to today or yesterday).
// Plus a bodyweight log with a mini trend line.
// ============================================================

import { getData, update, uid } from '../store.js';
import { setHabitByName } from './habits.js';
import { el, toast, todayKey, addDays, confirmAction, restoreScroll } from '../ui.js';
import { MODES, targetFor, kcalOk, proteinOk, kcalText, upsertTarget, weekTrend, trendVerdict, targetRange } from './targets.js';

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
  const waist = el('input', { type: 'number', placeholder: 'waist cm (weekly)', step: '0.1', min: '0', inputmode: 'decimal' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, kg, bf,
    el('button', { class: 'btn btn--primary', onClick: () => {
      const v = +kg.value, w = +waist.value || null;
      const have = getData().diet.weights.find((a) => a.date === todayKey());
      // waist on its own is fine once today's weight is in
      if (!v && !(w && have)) { toast(w ? 'Log your weight first, then the waist' : 'Enter your weight'); return; }
      update((x) => {
        const prev = x.diet.weights.find((a) => a.date === todayKey()) || {};
        x.diet.weights = x.diet.weights.filter((a) => a.date !== todayKey());
        const rec = { ...prev, date: todayKey(), kg: v || prev.kg, bf: +bf.value || prev.bf || null };
        if (w || prev.waist) rec.waist = w || prev.waist;
        x.diet.weights.push(rec);
      });
      kg.value = ''; bf.value = ''; waist.value = ''; toast('Logged'); rerender();
    } }, 'Log')));
  card.append(el('div', { class: 'rowflex', style: 'margin-top:8px' }, waist));
  const withWaist = weights.filter((x) => x.waist);
  if (withWaist.length) {
    const lw = withWaist[withWaist.length - 1], fw = withWaist[0];
    card.append(el('div', { class: 'hint' }, `waist ${lw.waist} cm (${lw.date})` +
      (withWaist.length > 1 ? ` · ${lw.waist - fw.waist >= 0 ? '+' : ''}${(lw.waist - fw.waist).toFixed(1)} cm since ${fw.date}` : '') +
      '. Same spot, same time, once a week.'));
  }

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
      card.append(el('div', { class: 'hint' }, `lean mass ${dLean >= 0 ? '+' : ''}${dLean}kg since ${f.date} — in either phase it should hold or rise`));
    }
  }
  return card;
}

// ---------- weekly trend review: 7-day averages, never single days ----------
function trendCard(rerender) {
  const d = getData(), today = todayKey();
  const t = targetFor(d, today);
  const weights = [...d.diet.weights].sort((a, b) => a.date.localeCompare(b.date));
  const w = weekTrend(weights, today);
  const card = el('div', { class: 'card card--accent' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, `⚖️ Weekly ${MODES[t.mode].label.toLowerCase()} review`), el('span', { class: 'card__sub' }, '7-day averages only')));

  if (w.thisWk == null || w.lastWk == null) {
    card.append(el('div', { class: 'empty muted' }, 'Need ~2 weeks of morning weigh-ins to compare. Keep logging daily.'));
    if (w.thisWk != null) card.append(el('div', { class: 'row__meta' }, `this week's average: ${w.thisWk.toFixed(2)} kg`));
    return card;
  }

  const rate = w.rate;                          // + = gaining
  const v = trendVerdict(t, today, w);
  const tile = (label, val, cls) => el('div', { class: 'ftile' }, el('div', { class: 'ftile__label' }, label), el('div', { class: 'ftile__val' + (cls ? ' ' + cls : '') }, val));
  const good = t.mode === 'cut' ? rate < 0 : rate > 0;
  card.append(el('div', { class: 'fgrid' },
    tile('This week avg', w.thisWk.toFixed(2) + ' kg'),
    tile('Last week avg', w.lastWk.toFixed(2) + ' kg'),
    tile('Rate', (rate >= 0 ? '+' : '−') + Math.abs(rate).toFixed(2) + ' kg/wk', good ? 'pos' : 'neg'),
    tile('Target', targetRange(t.mode))));
  const banner = el('div', { class: 'banner banner--gold', style: 'margin:12px 0 0' }, v.verdict);
  card.append(banner);
  if (v.delta) {
    const next = t.kcal + v.delta;
    banner.append(el('div', { style: 'margin-top:8px' },
      el('button', { class: 'btn btn--sm btn--primary', onClick: () => {
        if (!confirmAction(`Set the target to ${next.toLocaleString('en-GB')} kcal from today? Past days keep their old target.`)) return;
        update((x) => { x.diet.targets = upsertTarget(x.diet.targets, { ...t, from: today, kcal: next, note: `${v.delta > 0 ? '+' : ''}${v.delta} kcal from the weekly review` }); });
        rerender();
      } }, `Review: ${v.delta > 0 ? 'add' : 'remove'} ${Math.abs(v.delta)} kcal → ${next.toLocaleString('en-GB')}`)));
  }
  card.append(el('div', { class: 'hint' }, 'Two consecutive weeks before changing anything. Body-fat % from the scale is secondary: trust the weight trend, waist, photos, gym and running performance.'));
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
// The target itself lives in diet.targets (see targets.js), so a cut-to-bulk
// switch never rewrites how the old days are judged.
// iOS shows a numeric keypad for these and won't reject a stray space.
const numInput = (p={}) => el('input', { type: 'number', step: '1', min: '0', inputmode: 'numeric', ...p });
const parseNum = (v) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };

function intakeFor(d, key) { return (d.diet.intake || {})[key] || {}; }

let editingTarget = false;

function targetEditor(rerender) {
  const d = getData(), cur = targetFor(d, todayKey());
  const box = el('div', { style: 'margin-top:12px;padding-top:10px;border-top:1px solid var(--line)' });
  const mode = el('select', {}, ...Object.entries(MODES).map(([k, m]) => el('option', { value: k }, m.label)));
  mode.value = cur.mode;
  const kcal = numInput({ value: cur.kcal, style: 'max-width:100px' });
  const prot = numInput({ value: cur.protein, style: 'max-width:90px' });
  const from = el('input', { type: 'date', value: todayKey(), style: 'max-width:150px' });
  box.append(el('div', { class: 'rowflex' }, mode, kcal, el('span', { class: 'row__meta' }, 'kcal'), prot, el('span', { class: 'row__meta' }, 'g protein')));
  box.append(el('div', { class: 'rowflex', style: 'margin-top:8px' }, el('span', { class: 'row__meta' }, 'starts'), from,
    el('button', { class: 'btn btn--primary', onClick: () => {
      const k = parseNum(kcal.value), p = parseNum(prot.value);
      if (!k || !p || !from.value) { toast('Needs calories, protein and a start date'); return; }
      update((x) => { x.diet.targets = upsertTarget(x.diet.targets, { from: from.value, mode: mode.value, kcal: Math.round(k), protein: Math.round(p) }); });
      editingTarget = false; toast('Target saved. Earlier days keep their old one.'); rerender();
    } }, 'Save'),
    el('button', { class: 'btn btn--ghost', onClick: () => { editingTarget = false; rerender(); } }, 'Cancel')));
  const hist = [...(d.diet.targets || [])].sort((a, b) => b.from.localeCompare(a.from));
  box.append(el('div', { class: 'hint' }, 'History: ' + (hist.length
    ? hist.map((t) => `${t.from} ${MODES[t.mode] ? MODES[t.mode].label.toLowerCase() : t.mode} ${kcalText(t)}/${t.protein}g`).join(' · ') + ' · before that, the original cut 2,200/180g'
    : 'only the original cut, 2,200/180g')));
  return box;
}

function intakeCard(rerender) {
  const d = getData(), key = todayKey(), today = intakeFor(d, key);
  const tg = targetFor(d, key);
  const card = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, "Today's intake"),
      el('span', { class: 'chip chip--key' }, `${MODES[tg.mode].label} · ${kcalText(tg)} kcal`)));

  const kcal = numInput({ placeholder: String(tg.kcal), value: today.kcal != null ? today.kcal : '', style: 'max-width:110px' });
  const prot = numInput({ placeholder: String(tg.protein), value: today.protein != null ? today.protein : '', style: 'max-width:110px' });

  // Typing the numbers ticks the habits for you — one place to enter it, not two.
  const save = () => {
    const k = parseNum(kcal.value), p = parseNum(prot.value);
    update((x) => {
      x.diet.intake = x.diet.intake || {};
      if (k == null && p == null) delete x.diet.intake[key];
      else x.diet.intake[key] = { ...(x.diet.intake[key] || {}), kcal: k, protein: p };
    });
    if (k != null) setHabitByName('calor', key, kcalOk(tg, k));
    if (p != null) setHabitByName('protein', key, proteinOk(tg, p));
    rerender();
  };
  kcal.addEventListener('change', save);
  prot.addEventListener('change', save);

  card.append(el('div', { class: 'rowflex' }, el('span', { class: 'row__name', style: 'flex:1' }, 'Calories'), kcal,
    el('span', { class: 'row__meta' }, 'target ' + kcalText(tg))));
  card.append(el('div', { class: 'rowflex', style: 'margin-top:8px' }, el('span', { class: 'row__name', style: 'flex:1' }, 'Protein (g)'), prot,
    el('span', { class: 'row__meta' }, 'target ' + tg.protein)));

  // Last 7 days, each judged against the target that applied THAT day.
  const keys = Array.from({ length: 7 }, (_, i) => addDays(key, i - 6));
  const days = keys.map((k) => ({ k, v: intakeFor(d, k), t: targetFor(d, k) })).filter((x) => typeof x.v.kcal === 'number');
  if (days.length) {
    card.append(el('div', { class: 'row__meta', style: 'margin-top:10px;flex-wrap:wrap' }, ...days.map((x) =>
      el('span', { class: 'chip' + (kcalOk(x.t, x.v.kcal) ? ' chip--key' : '') },
        new Date(x.k + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + x.v.kcal))));
    const avg = days.reduce((a, x) => a + x.v.kcal, 0) / days.length;
    const gap = avg - tg.kcal;       // + = over target
    const per = (Math.abs(gap) * 7 / 7700).toFixed(1);
    let msg;
    if (kcalOk(tg, avg)) msg = 'on target.';
    else if (tg.mode === 'bulk') msg = gap < 0 ? `${Math.round(-gap)} under. That is about ${per}kg a week of growth you are not getting.` : `${Math.round(gap)} over, fine unless the scale runs ahead of plan.`;
    else msg = gap > 0 ? `${Math.round(gap)} over. That is about ${per}kg a week in the wrong direction.` : `${Math.round(-gap)} under.`;
    card.append(el('div', { class: 'hint' }, `7-day average ${Math.round(avg)} kcal from ${days.length} logged ${days.length === 1 ? 'day' : 'days'}: ${msg}`));
  } else {
    card.append(el('div', { class: 'hint' }, 'Copy the two totals across at the end of each day. Nothing else needed.'));
  }

  if (editingTarget) card.append(targetEditor(rerender));
  else card.append(el('button', { class: 'btn btn--sm btn--ghost', style: 'margin-top:10px', onClick: () => { editingTarget = true; rerender(); } }, 'Edit target'));
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
  view.append(el('div', { class: 'section-title' }, 'Weight trend'));
  view.append(trendCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Bodyweight'));
  view.append(weightCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Meal prep'));
  view.append(mealPrepCard(rerender));
  restoreScroll(y);
}

export default { render };
