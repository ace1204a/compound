// ============================================================
// Money — the debt-payoff engine + monthly numbers.
// Watch the total fall. Family first.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction } from '../ui.js';

const gbp = (n) => '£' + (+n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function summaryCard() {
  const d = getData();
  const start = d.finance.debts.reduce((n, x) => n + (+x.start || 0), 0);
  const now = d.finance.debts.reduce((n, x) => n + (+x.balance || 0), 0);
  const paid = Math.max(0, start - now);
  const pct = start ? Math.min(100, (paid / start) * 100) : 0;

  const card = el('div', { class: 'card card--accent' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '📉 Total debt'),
    paid > 0 ? el('span', { class: 'chip chip--key' }, `${gbp(paid)} paid off`) : null));
  card.append(el('div', { class: 'big-num neg' }, gbp(now)));
  card.append(el('div', { html:
    `<div style="height:10px;border-radius:6px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;margin-top:10px">
       <div style="height:100%;width:${pct.toFixed(1)}%;background:linear-gradient(90deg,var(--gold),var(--green))"></div>
     </div>` }));
  card.append(el('div', { class: 'hint' }, start ? `started at ${gbp(start)} · ${pct.toFixed(1)}% destroyed` : 'Add your debts below.'));
  return card;
}

function debtRow(x, rerender) {
  const payWrap = el('div', { class: 'rowflex', style: 'display:none;margin-top:8px;width:100%' });
  const amt = el('input', { type: 'number', placeholder: '£ paid', min: '0', step: '0.01', inputmode: 'decimal', style: 'max-width:130px' });
  payWrap.append(amt, el('button', { class: 'btn btn--sm btn--primary', onClick: () => {
    const v = +amt.value; if (!v) { toast('Enter an amount'); return; }
    update((d) => { const t = d.finance.debts.find((a) => a.id === x.id); t.balance = Math.max(0, +(t.balance - v).toFixed(2)); });
    toast(`${gbp(v)} off ${x.name} 🔨`); rerender();
  } }, 'Log payment'));

  const paidOff = +x.balance <= 0;
  return el('div', { class: 'row', style: 'flex-wrap:wrap' },
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' + (paidOff ? ' pos' : '') }, (paidOff ? '✅ ' : '') + x.name),
      el('div', { class: 'row__meta' }, `${gbp(x.balance)} of ${gbp(x.start)}`)),
    !paidOff ? el('button', { class: 'btn btn--sm', onClick: () => { payWrap.style.display = payWrap.style.display === 'none' ? 'flex' : 'none'; amt.focus(); } }, '− pay') : null,
    el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction(`Delete "${x.name}"?`)) { update((d) => { d.finance.debts = d.finance.debts.filter((a) => a.id !== x.id); }); rerender(); } } }, '×'),
    payWrap,
  );
}

function debtsCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Debts'), el('span', { class: 'card__sub' }, 'family first')));
  const sorted = [...d.finance.debts].sort((a, b) => (a.priority || 99) - (b.priority || 99));
  if (!sorted.length) card.append(el('div', { class: 'empty muted' }, 'No debts listed. Import seed data in Settings, or add below.'));
  sorted.forEach((x) => card.append(debtRow(x, rerender)));

  const name = el('input', { type: 'text', placeholder: 'Who / what', maxlength: '40' });
  const amount = el('input', { type: 'number', placeholder: '£', min: '0', step: '0.01', inputmode: 'decimal', style: 'max-width:120px' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, name, amount,
    el('button', { class: 'btn', onClick: () => {
      const n = name.value.trim(); const v = +amount.value;
      if (!n || !v) { toast('Name + amount'); return; }
      update((dd) => { dd.finance.debts.push({ id: uid(), name: n, start: v, balance: v, priority: dd.finance.debts.length + 1 }); });
      name.value = ''; amount.value = ''; rerender();
    } }, 'Add')));
  return card;
}

function monthsCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Monthly numbers'),
    el('span', { class: 'card__sub' }, 'in / out / kept')));

  [...d.finance.months].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12).forEach((m) => {
    const net = (+m.income || 0) - (+m.spend || 0);
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' },
        el('div', { class: 'row__name' }, m.month),
        el('div', { class: 'row__meta' }, `in ${gbp(m.income)} · out ${gbp(m.spend)} · net `, el('span', { class: net >= 0 ? 'pos' : 'neg' }, gbp(net)))),
      el('button', { class: 'btn btn--icon', onClick: () => { update((dd) => { dd.finance.months = dd.finance.months.filter((a) => a.id !== m.id); }); rerender(); } }, '×')));
  });

  const month = el('input', { type: 'text', placeholder: 'YYYY-MM', maxlength: '7', style: 'max-width:110px', value: new Date().toISOString().slice(0, 7) });
  const inc = el('input', { type: 'number', placeholder: 'in £', min: '0', inputmode: 'decimal' });
  const out = el('input', { type: 'number', placeholder: 'out £', min: '0', inputmode: 'decimal' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, month, inc, out,
    el('button', { class: 'btn', onClick: () => {
      if (!/^\d{4}-\d{2}$/.test(month.value)) { toast('Month like 2026-07'); return; }
      update((dd) => {
        dd.finance.months = dd.finance.months.filter((a) => a.month !== month.value);
        dd.finance.months.push({ id: uid(), month: month.value, income: +inc.value || 0, spend: +out.value || 0, saved: 0 });
      });
      inc.value = ''; out.value = ''; toast('Month logged'); rerender();
    } }, 'Save')));
  card.append(el('div', { class: 'hint' }, 'Once a month, 60 seconds. The habit of looking is the whole point.'));
  return card;
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Money'));
  view.append(summaryCard());
  view.append(el('div', { class: 'section-title' }, 'Debts'));
  view.append(debtsCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Months'));
  view.append(monthsCard(rerender));
}

export default { render };
