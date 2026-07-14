// ============================================================
// Plan — the living protocol, inside the app.
// Content is DATA (synced, private), never hardcoded here:
// it arrives via plan patches imported in Settings, and small
// edits can be made right on this page.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, timeToMin, confirmAction } from '../ui.js';

/** Which schedule block are we in right now? Returns { current, next }. */
export function nowAndNext(day) {
  const blocks = [...(day || [])].filter((b) => timeToMin(b.time) !== null)
    .sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  if (!blocks.length) return { current: null, next: null };
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  let current = null;
  for (const b of blocks) if (timeToMin(b.time) <= now) current = b;
  const next = current
    ? blocks[blocks.indexOf(current) + 1] || { ...blocks[0], tomorrow: true }
    : blocks[0];
  return { current, next };
}

function sleepCard(plan) {
  if (!plan.sleep) return null;
  return el('div', { class: 'card card--accent' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, '🌙 Sleep window'),
      el('span', { class: 'chip chip--key' }, plan.sleep.phase || 'active')),
    el('div', { class: 'rowflex', style: 'gap:24px;margin-top:4px' },
      el('div', {}, el('div', { class: 'card__sub' }, 'Bed by'), el('div', { class: 'big-num' }, plan.sleep.bed || '—')),
      el('div', {}, el('div', { class: 'card__sub' }, 'Wake at'), el('div', { class: 'big-num', style: 'color:var(--gold)' }, plan.sleep.wake || '—'))));
}

function scheduleCard(plan, rerender) {
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '📋 The day, hour by hour'),
    el('span', { class: 'card__sub' }, 'gold = you are here')));

  const { current } = nowAndNext(plan.day);
  const blocks = [...plan.day].sort((a, b) => (timeToMin(a.time) ?? 0) - (timeToMin(b.time) ?? 0));

  blocks.forEach((b) => {
    const isNow = current && b.id === current.id;
    card.append(el('div', { class: 'block' + (isNow ? ' block--now' : '') },
      el('div', { class: 'block__time' }, b.time),
      el('div', { class: 'block__main' },
        el('div', { class: 'block__title' }, (isNow ? '▶ ' : '') + b.title),
        b.detail ? el('div', { class: 'block__detail' }, b.detail) : null),
      el('button', { class: 'btn btn--icon', title: 'Remove block', onClick: () => { if (confirmAction(`Remove "${b.title}"?`)) { update((d) => { d.plan.day = d.plan.day.filter((x) => x.id !== b.id); }); rerender(); } } }, '×')));
  });
  if (!blocks.length) card.append(el('div', { class: 'empty muted' }, 'No schedule yet — add blocks below or import a plan patch in Settings.'));

  // add a block
  const time = el('input', { type: 'text', placeholder: '08:00', maxlength: '5', style: 'max-width:86px' });
  const title = el('input', { type: 'text', placeholder: 'Block title', maxlength: '60' });
  const detail = el('input', { type: 'text', placeholder: 'Detail (optional)', maxlength: '120' });
  card.append(el('div', { class: 'stack', style: 'margin-top:12px' },
    el('div', { class: 'rowflex' }, time, title),
    detail,
    el('button', { class: 'btn btn--full', onClick: () => {
      if (timeToMin(time.value) === null) { toast('Time like 08:00'); return; }
      if (!title.value.trim()) { toast('Give the block a title'); return; }
      update((d) => { d.plan.day.push({ id: uid(), time: time.value.trim(), title: title.value.trim(), detail: detail.value.trim() }); });
      time.value = ''; title.value = ''; detail.value = '';
      rerender();
    } }, '+ Add block')));
  return card;
}

function sectionCard(s) {
  return el('div', { class: 'card' },
    el('div', { class: 'card__title', style: 'margin-bottom:8px' }, `${s.emoji || '•'} ${s.title}`),
    ...s.lines.map((line) => el('div', { class: 'planline' }, line)));
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();
  const plan = d.plan;

  view.append(el('div', { class: 'section-title' }, 'The Plan'));

  if (!plan.day.length && !plan.sections.length && !plan.sleep) {
    view.append(el('div', { class: 'card empty' },
      el('span', { class: 'empty__emoji' }, '📋'),
      el('div', {}, 'No plan loaded yet.'),
      el('div', { class: 'hint' }, 'Import the plan patch from Claude in Settings → Import, or build your day below.')));
    view.append(scheduleCard(plan, rerender));
    return;
  }

  if (plan.note) view.append(el('div', { class: 'banner banner--gold' }, plan.note));
  const sc = sleepCard(plan);
  if (sc) view.append(sc);
  view.append(scheduleCard(plan, rerender));

  if (plan.sections.length) {
    view.append(el('div', { class: 'section-title' }, 'Protocols'));
    plan.sections.forEach((s) => view.append(sectionCard(s)));
  }
  if (plan.updated) view.append(el('div', { class: 'hint', style: 'text-align:center' }, `plan version: ${plan.updated} · review monthly with Claude`));
}

export default { render };
