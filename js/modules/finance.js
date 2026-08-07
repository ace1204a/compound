// ============================================================
// Money — an integrated finance tracker to replace the Excel.
//  - Accounts (net worth)
//  - Transaction log (month by month, in / out / net)
//  - Recurring subscriptions (monthly total)
//  - Debt payoff (family first)
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, confirmAction , restoreScroll } from '../ui.js';

const gbp = (n) => '£' + (+n || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function shiftMonth(ym, delta) { let [y, m] = ym.split('-').map(Number); m += delta; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
function numInput(props = {}) { return el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', ...props }); }
function parseNum(v) { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; }

let selectedMonth = todayKey().slice(0, 7);

// ---------- summary ----------
function summaryCard() {
  const d = getData().finance;
  const netWorth = (d.accounts || []).reduce((n, a) => n + (+a.balance || 0), 0);
  const debt = (d.debts || []).reduce((n, x) => n + (+x.balance || 0), 0);
  const subs = (d.subscriptions || []).reduce((n, s) => n + (+s.amount || 0), 0);
  const monthTx = (d.transactions || []).filter((t) => (t.date || '').startsWith(selectedMonth));
  const inc = monthTx.filter((t) => t.kind === 'in').reduce((n, t) => n + (+t.amount || 0), 0);
  const out = monthTx.filter((t) => t.kind === 'out').reduce((n, t) => n + (+t.amount || 0), 0);
  const net = inc - out;

  const tile = (label, val, cls) => el('div', { class: 'ftile' }, el('div', { class: 'ftile__label' }, label), el('div', { class: 'ftile__val ' + (cls || '') }, val));
  return el('div', { class: 'card card--accent' },
    el('div', { class: 'card__title', style: 'margin-bottom:10px' }, '💷 Overview'),
    el('div', { class: 'fgrid' },
      tile('Net worth', gbp(netWorth), netWorth >= 0 ? 'pos' : 'neg'),
      tile('Total debt', gbp(debt), 'neg'),
      tile(monthLabel(selectedMonth) + ' net', (net >= 0 ? '+' : '') + gbp(net), net >= 0 ? 'pos' : 'neg'),
      tile('Subscriptions', gbp(subs) + '/mo', '')));
}

// ---------- accounts (net worth) ----------
function accountsCard(rerender) {
  const d = getData().finance;
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Accounts'),
    el('span', { class: 'big-num' }, gbp((d.accounts || []).reduce((n, a) => n + (+a.balance || 0), 0)))));

  (d.accounts || []).forEach((a) => {
    const bal = numInput({ value: a.balance, style: 'max-width:130px;text-align:right' });
    bal.addEventListener('change', () => { const v = parseNum(bal.value); update((x) => { x.finance.accounts.find((y) => y.id === a.id).balance = v == null ? 0 : v; }); });
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, a.name)),
      bal,
      el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.finance.accounts = x.finance.accounts.filter((y) => y.id !== a.id); }); rerender(); } }, '×')));
  });

  const name = el('input', { type: 'text', placeholder: 'Account (e.g. Lloyds)', maxlength: '30' });
  const amount = numInput({ placeholder: '£ balance', style: 'max-width:120px' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, name, amount,
    el('button', { class: 'btn', onClick: () => { const n = name.value.trim(); const v = parseNum(amount.value); if (!n || v == null) { toast('Name + balance'); return; } update((x) => { x.finance.accounts.push({ id: uid(), name: n, balance: v }); }); name.value = ''; amount.value = ''; rerender(); } }, 'Add')));
  return card;
}

// ---------- transactions ----------
function txCard(rerender) {
  const d = getData().finance;
  const monthTx = (d.transactions || []).filter((t) => (t.date || '').startsWith(selectedMonth)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const inc = monthTx.filter((t) => t.kind === 'in').reduce((n, t) => n + (+t.amount || 0), 0);
  const out = monthTx.filter((t) => t.kind === 'out').reduce((n, t) => n + (+t.amount || 0), 0);

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'rowflex', style: 'margin-bottom:6px' },
    el('button', { class: 'btn btn--icon', onClick: () => { selectedMonth = shiftMonth(selectedMonth, -1); rerender(); } }, '‹'),
    el('div', { style: 'flex:1;text-align:center;font-weight:700' }, monthLabel(selectedMonth)),
    el('button', { class: 'btn btn--icon', onClick: () => { selectedMonth = shiftMonth(selectedMonth, 1); rerender(); } }, '›')));
  card.append(el('div', { class: 'rowflex', style: 'gap:16px;margin-bottom:8px' },
    el('span', { class: 'chip' }, 'in '), el('span', { class: 'pos' }, gbp(inc)),
    el('span', { class: 'chip' }, 'out'), el('span', { class: 'neg' }, gbp(out)),
    el('span', { class: 'spacer' }), el('span', {}, 'net '), el('span', { class: (inc - out) >= 0 ? 'pos' : 'neg' }, gbp(inc - out))));

  // add transaction
  let kind = 'out';
  const date = el('input', { type: 'date', value: todayKey(), style: 'max-width:150px' });
  const desc = el('input', { type: 'text', placeholder: 'What for?', maxlength: '40' });
  const amount = numInput({ placeholder: '£', style: 'max-width:90px' });
  const kseg = el('div', { class: 'seg' },
    el('button', { class: 'on', onClick: (e) => { kind = 'out'; kseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); } }, 'Out'),
    el('button', { onClick: (e) => { kind = 'in'; kseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); } }, 'In'));
  card.append(el('div', { class: 'stack', style: 'border-top:1px solid var(--line);padding-top:10px' },
    el('div', { class: 'rowflex' }, kseg, date),
    el('div', { class: 'rowflex' }, desc, amount,
      el('button', { class: 'btn btn--primary', onClick: () => {
        const v = parseNum(amount.value); if (!desc.value.trim() || v == null) { toast('Description + amount'); return; }
        update((x) => { x.finance.transactions.push({ id: uid(), date: date.value || todayKey(), desc: desc.value.trim(), amount: Math.abs(v), kind, account: '' }); });
        desc.value = ''; amount.value = ''; toast('Logged'); rerender();
      } }, 'Add'))));

  // list
  monthTx.slice(0, 60).forEach((t) => card.append(el('div', { class: 'row' },
    el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, t.desc), el('div', { class: 'row__meta' }, t.date)),
    el('span', { class: t.kind === 'in' ? 'pos' : 'neg' }, (t.kind === 'in' ? '+' : '−') + gbp(t.amount)),
    el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.finance.transactions = x.finance.transactions.filter((y) => y.id !== t.id); }); rerender(); } }, '×'))));
  if (!monthTx.length) card.append(el('div', { class: 'empty muted' }, 'No transactions this month.'));
  return card;
}

// ---------- subscriptions ----------
function subsCard(rerender) {
  const d = getData().finance;
  const total = (d.subscriptions || []).reduce((n, s) => n + (+s.amount || 0), 0);
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Subscriptions'), el('span', { class: 'chip' }, gbp(total) + '/mo')));
  [...(d.subscriptions || [])].sort((a, b) => b.amount - a.amount).forEach((s) => card.append(el('div', { class: 'row' },
    el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, s.name), s.day ? el('div', { class: 'row__meta' }, 'due ' + s.day + 'th') : null),
    el('span', {}, gbp(s.amount)),
    el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.finance.subscriptions = x.finance.subscriptions.filter((y) => y.id !== s.id); }); rerender(); } }, '×'))));
  const name = el('input', { type: 'text', placeholder: 'Name', maxlength: '30' });
  const amount = numInput({ placeholder: '£', style: 'max-width:80px' });
  const day = el('input', { type: 'number', placeholder: 'day', min: '1', max: '31', style: 'max-width:70px' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, name, amount, day,
    el('button', { class: 'btn', onClick: () => { const n = name.value.trim(); const v = parseNum(amount.value); if (!n || v == null) { toast('Name + amount'); return; } update((x) => { x.finance.subscriptions.push({ id: uid(), name: n, amount: Math.abs(v), day: +day.value || 0 }); }); name.value = ''; amount.value = ''; day.value = ''; rerender(); } }, 'Add')));
  if (total > 0) card.append(el('div', { class: 'hint' }, `That's ${gbp(total * 12)}/year. Every one you cut is money toward the debt.`));
  return card;
}

// ---------- debts ----------
function debtsCard(rerender) {
  const d = getData().finance;
  const start = (d.debts || []).reduce((n, x) => n + (+x.start || 0), 0);
  const now = (d.debts || []).reduce((n, x) => n + (+x.balance || 0), 0);
  const paid = Math.max(0, start - now);
  const pct = start ? Math.min(100, (paid / start) * 100) : 0;

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '📉 Debt — family first'), paid > 0 ? el('span', { class: 'chip chip--key' }, gbp(paid) + ' paid') : null));
  card.append(el('div', { class: 'big-num neg' }, gbp(now)));
  card.append(el('div', { html: `<div style="height:10px;border-radius:6px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;margin:10px 0"><div style="height:100%;width:${pct.toFixed(1)}%;background:linear-gradient(90deg,var(--gold),var(--green))"></div></div>` }));
  if (start) card.append(el('div', { class: 'hint', style: 'margin-bottom:8px' }, `started ${gbp(start)} · ${pct.toFixed(1)}% cleared`));

  [...(d.debts || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach((x) => {
    const paidOff = +x.balance <= 0;
    const payWrap = el('div', { class: 'rowflex', style: 'display:none;width:100%;margin-top:8px' });
    const amt = numInput({ placeholder: '£ paid', style: 'max-width:120px' });
    payWrap.append(amt, el('button', { class: 'btn btn--sm btn--primary', onClick: () => { const v = parseNum(amt.value); if (v == null) return; update((z) => { const t = z.finance.debts.find((y) => y.id === x.id); t.balance = Math.max(0, +(t.balance - v).toFixed(2)); }); toast(`${gbp(v)} off ${x.name} 🔨`); rerender(); } }, 'Log payment'));
    card.append(el('div', { class: 'row', style: 'flex-wrap:wrap' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' + (paidOff ? ' pos' : '') }, (paidOff ? '✅ ' : '') + x.name), el('div', { class: 'row__meta' }, `${gbp(x.balance)} of ${gbp(x.start)}`)),
      !paidOff ? el('button', { class: 'btn btn--sm', onClick: () => { payWrap.style.display = payWrap.style.display === 'none' ? 'flex' : 'none'; } }, '− pay') : null,
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction(`Delete "${x.name}"?`)) { update((z) => { z.finance.debts = z.finance.debts.filter((y) => y.id !== x.id); }); rerender(); } } }, '×'),
      payWrap));
  });

  const name = el('input', { type: 'text', placeholder: 'Who / what', maxlength: '30' });
  const amount = numInput({ placeholder: '£', style: 'max-width:100px' });
  card.append(el('div', { class: 'rowflex', style: 'margin-top:10px' }, name, amount,
    el('button', { class: 'btn', onClick: () => { const n = name.value.trim(); const v = parseNum(amount.value); if (!n || v == null) { toast('Name + amount'); return; } update((z) => { z.finance.debts.push({ id: uid(), name: n, start: v, balance: v, priority: z.finance.debts.length + 1 }); }); name.value = ''; amount.value = ''; rerender(); } }, 'Add')));
  return card;
}

function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Money'));
  view.append(summaryCard());
  view.append(el('div', { class: 'section-title' }, 'Accounts'));
  view.append(accountsCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Transactions'));
  view.append(txCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Subscriptions'));
  view.append(subsCard(rerender));
  view.append(el('div', { class: 'section-title' }, 'Debts'));
  view.append(debtsCard(rerender));
  restoreScroll(y);
}

export default { render };
