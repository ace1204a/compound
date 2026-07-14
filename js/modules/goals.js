// ============================================================
// Goals — every life area with its own gameplan.
// A goal = what + WHY + status. The why matters most: it's
// what you reread on the days you want to quit.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction } from '../ui.js';

export const AREAS = ['Wealth', 'Trading', 'Health', 'Physique', 'Mind', 'Skills', 'Social', 'Looks', 'Uni', 'Other'];

function goalRow(g, rerender) {
  return el('div', { class: 'row' + (g.status === 'done' ? ' done' : '') },
    el('button', {
      class: 'check' + (g.status === 'done' ? ' on' : ''), 'aria-label': 'Complete goal',
      onClick: () => { update((d) => { const x = d.goals.find((a) => a.id === g.id); x.status = x.status === 'done' ? 'active' : 'done'; }); rerender(); },
    }),
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, g.title),
      g.why ? el('div', { class: 'row__meta' }, el('span', { class: 'muted' }, 'why: ' + g.why)) : null,
    ),
    el('button', { class: 'btn btn--icon', title: 'Delete', onClick: () => { if (confirmAction(`Delete goal "${g.title}"?`)) { update((d) => { d.goals = d.goals.filter((a) => a.id !== g.id); }); rerender(); } } }, '×'),
  );
}

function addForm(rerender) {
  const title = el('input', { type: 'text', placeholder: 'The goal — specific and measurable', maxlength: '120' });
  const why = el('input', { type: 'text', placeholder: 'Why it matters (be honest)', maxlength: '160' });
  const area = el('select', {}, ...AREAS.map((a) => el('option', { value: a }, a)));

  function submit() {
    const t = title.value.trim();
    if (!t) { toast('Name the goal'); return; }
    update((d) => { d.goals.push({ id: uid(), area: area.value, title: t, why: why.value.trim(), status: 'active', createdAt: new Date().toISOString() }); });
    title.value = ''; why.value = '';
    toast('Goal added'); rerender();
  }

  return el('div', { class: 'card' },
    el('div', { class: 'field' }, el('span', {}, 'Area'), area),
    el('div', { class: 'field' }, el('span', {}, 'Goal'), title),
    el('div', { class: 'field' }, el('span', {}, 'Why'), why),
    el('button', { class: 'btn btn--primary btn--full', onClick: submit }, 'Add goal'),
  );
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Goals & life areas'));
  view.append(addForm(rerender));

  const d = getData();
  if (!d.goals.length) {
    view.append(el('div', { class: 'card empty' }, el('span', { class: 'empty__emoji' }, '◆'),
      el('div', {}, 'No goals yet. Import your seed data in Settings, or add one above.')));
    return;
  }

  for (const area of AREAS) {
    const items = d.goals.filter((g) => g.area === area);
    if (!items.length) continue;
    const done = items.filter((g) => g.status === 'done').length;
    view.append(el('div', { class: 'section-title' }, `${area} · ${done}/${items.length}`));
    const c = el('div', { class: 'card' });
    items.forEach((g) => c.append(goalRow(g, rerender)));
    view.append(c);
  }
}

export default { render };
