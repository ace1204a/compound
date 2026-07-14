// ============================================================
// Diet — your own rules, ticked daily. A "clean day" = all
// rules ticked. Clean-day streak works like habit streaks
// (forgiving: counts up to today or yesterday).
// Plus a bodyweight log with a mini trend line.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, addDays, confirmAction } from '../ui.js';

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

  const kg = el('input', { type: 'number', placeholder: 'kg today', step: '0.1', min: '0', inputmode: 'decimal' });
  card.append(el('div', { class: 'inline-form', style: 'margin-top:10px' }, kg,
    el('button', { class: 'btn btn--primary', onClick: () => {
      const v = +kg.value; if (!v) { toast('Enter your weight'); return; }
      update((x) => {
        x.diet.weights = x.diet.weights.filter((a) => a.date !== todayKey());
        x.diet.weights.push({ date: todayKey(), kg: v });
      });
      kg.value = ''; toast('Logged'); rerender();
    } }, 'Log')));
  return card;
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Diet'));
  view.append(rulesCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Bodyweight'));
  view.append(weightCard(rerender));
}

export default { render };
