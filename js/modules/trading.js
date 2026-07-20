// ============================================================
// Trading discipline — NOT tips, NOT signals. One question:
// did you follow YOUR OWN rules today?
// A "clean session" = every rule ticked. The streak counts
// consecutive clean *logged* sessions (calendar gaps between
// trading days don't break it — skipping the log does).
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, confirmAction } from '../ui.js';

function sessionDates(d) {
  return Object.keys(d.trading.log).sort(); // ascending
}

function isClean(d, dateKey) {
  const day = d.trading.log[dateKey];
  if (!day || !d.trading.rules.length) return false;
  return d.trading.rules.every((r) => day.followed && day.followed[r.id]);
}

export function cleanRun(d) {
  const dates = sessionDates(d);
  let run = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (isClean(d, dates[i])) run++;
    else break;
  }
  return run;
}

function todayCard(rerender) {
  const d = getData();
  const key = todayKey();
  const day = d.trading.log[key];
  const run = cleanRun(d);

  const card = el('div', { class: 'card card--accent' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '⇅ Today’s session'),
    run > 0 ? el('span', { class: 'chip chip--streak' }, `🔥 ${run} clean in a row`) : el('span', { class: 'card__sub' }, 'log after you trade')));

  if (!d.trading.rules.length) {
    card.append(el('div', { class: 'empty muted' }, 'Add your rules below first. Your rules — the plan you keep breaking when it matters.'));
    return card;
  }

  d.trading.rules.forEach((r) => {
    const on = !!(day && day.followed && day.followed[r.id]);
    card.append(el('div', { class: 'row' + (on ? ' done' : '') },
      el('button', { class: 'check check--gold' + (on ? ' on' : ''), onClick: () => {
        update((x) => {
          const t = x.trading.log[key] = x.trading.log[key] || { followed: {}, note: '' };
          if (t.followed[r.id]) delete t.followed[r.id]; else t.followed[r.id] = true;
        });
        rerender();
      } }),
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, r.text))));
  });

  const note = el('input', { type: 'text', placeholder: 'Note — what happened, how you felt', value: (day && day.note) || '', maxlength: '200' });
  note.addEventListener('change', () => update((x) => { const t = x.trading.log[key] = x.trading.log[key] || { followed: {}, note: '' }; t.note = note.value; }));
  card.append(el('div', { style: 'margin-top:10px' }, note));

  // the daily loop: review today, plan tomorrow — done at the 21:00 block
  const review = el('textarea', { placeholder: '21:00 review — every trade journaled? What actually happened, what to fix…' });
  review.value = (day && day.review) || '';
  review.addEventListener('change', () => { update((x) => { const t = x.trading.log[key] = x.trading.log[key] || { followed: {}, note: '' }; t.review = review.value.trim(); }); toast('Review saved'); });
  const tomorrow = el('textarea', { placeholder: 'Tomorrow — bias, levels, which A-setups you’ll wait for…' });
  tomorrow.value = (day && day.tomorrow) || '';
  tomorrow.addEventListener('change', () => { update((x) => { const t = x.trading.log[key] = x.trading.log[key] || { followed: {}, note: '' }; t.tomorrow = tomorrow.value.trim(); }); toast('Tomorrow’s plan saved'); });
  card.append(
    el('div', { class: 'field', style: 'margin-top:10px' }, el('span', {}, 'Daily review'), review),
    el('div', { class: 'field' }, el('span', {}, 'Tomorrow’s outlook'), tomorrow));

  if (day && isClean(d, key)) {
    card.append(el('div', { class: 'banner', style: 'margin-top:10px;margin-bottom:0' }, '✅ Clean session. This is the payout that matters — the streak IS the edge.'));
  } else if (day && Object.keys(day.followed || {}).length > 0 && !isClean(d, key)) {
    card.append(el('div', { class: 'banner banner--warn', style: 'margin-top:10px;margin-bottom:0' }, 'Rules broken = logged honestly. That’s worth more than a green day. Tomorrow: clean.'));
  }
  return card;
}

function accountsCard(rerender) {
  const d = getData();
  const a = d.trading.accounts;
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '💼 Accounts'),
    a && a.updatedAt ? el('span', { class: 'card__sub' }, 'updated ' + a.updatedAt.slice(0, 10)) : el('span', { class: 'card__sub' }, 'week-level view')));

  if (a) {
    card.append(el('div', { class: 'rowflex', style: 'gap:24px;margin:4px 0 10px' },
      el('div', {}, el('div', { class: 'card__sub' }, 'Balance vs start'), el('div', { class: 'big-num ' + (+a.balance >= 0 ? 'pos' : 'neg') }, (+a.balance >= 0 ? '+' : '') + (+a.balance).toLocaleString('en-GB'))),
      el('div', {}, el('div', { class: 'card__sub' }, 'Buffer to max loss'), el('div', { class: 'big-num', style: 'color:var(--gold)' }, (+a.buffer).toLocaleString('en-GB')))));
  }

  const balance = el('input', { type: 'number', placeholder: 'balance +/-', step: '0.01', inputmode: 'decimal', value: a ? a.balance : '' });
  const buffer = el('input', { type: 'number', placeholder: 'buffer to blown', step: '0.01', inputmode: 'decimal', value: a ? a.buffer : '' });
  card.append(el('div', { class: 'rowflex' }, balance, buffer,
    el('button', { class: 'btn', onClick: () => {
      if (balance.value === '' || buffer.value === '') { toast('Both numbers'); return; }
      update((x) => { x.trading.accounts = { balance: +balance.value, buffer: +buffer.value, updatedAt: new Date().toISOString() }; });
      toast('Accounts updated'); rerender();
    } }, 'Save')));
  card.append(el('div', { class: 'hint' }, 'Update after each session. The buffer is the number that keeps you honest — it shrinks, you size down.'));
  return card;
}

function rulesCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'My rules'),
    el('span', { class: 'card__sub' }, 'written when calm, obeyed when not')));

  d.trading.rules.forEach((r) => {
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, r.text)),
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction('Remove this rule?')) { update((x) => { x.trading.rules = x.trading.rules.filter((a) => a.id !== r.id); }); rerender(); } } }, '×')));
  });

  const input = el('input', { type: 'text', placeholder: 'Add a rule — e.g. Hard daily loss limit', maxlength: '120' });
  card.append(el('div', { class: 'inline-form', style: 'margin-top:10px' }, input,
    el('button', { class: 'btn', onClick: () => {
      const v = input.value.trim(); if (!v) return;
      update((x) => { x.trading.rules.push({ id: uid(), text: v }); });
      input.value = ''; rerender();
    } }, 'Add')));
  return card;
}

function historyCard(rerender) {
  const d = getData();
  const dates = sessionDates(d).reverse();
  const card = el('div', { class: 'card' });
  if (!dates.length) { card.append(el('div', { class: 'empty muted' }, 'No sessions logged yet.')); return card; }
  dates.slice(0, 30).forEach((k) => {
    const clean = isClean(d, k);
    const day = d.trading.log[k];
    card.append(el('div', { class: 'row' },
      el('span', { class: 'chip ' + (clean ? 'chip--key' : ''), style: clean ? '' : 'color:var(--red);border-color:var(--red-dim)' }, clean ? 'clean' : 'broke rules'),
      el('div', { class: 'row__main' },
        el('div', { class: 'row__name' }, k),
        day.note ? el('div', { class: 'row__meta' }, day.note) : null,
        day.review ? el('div', { class: 'row__meta' }, '📝 ' + day.review.slice(0, 90)) : null,
        day.tomorrow ? el('div', { class: 'row__meta' }, '🎯 ' + day.tomorrow.slice(0, 90)) : null),
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction('Delete this session log?')) { update((x) => { delete x.trading.log[k]; }); rerender(); } } }, '×')));
  });
  return card;
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Trading discipline'));
  view.append(el('div', { class: 'banner banner--gold' },
    'This page doesn’t care about P&L. It cares about one thing: did you follow your own plan? Protect the skill from the gamble.'));
  view.append(todayCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Accounts'));
  view.append(accountsCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Rules'));
  view.append(rulesCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Session history'));
  view.append(historyCard(rerender));
}

export default { render };
