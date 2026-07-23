// ============================================================
// Plan — the living protocol, inside the app.
// Content is DATA (synced, private), never hardcoded here.
// Every block can be TICKED as you move through the day, so
// the plan is a checklist you walk down, not a poster.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, timeToMin, todayKey, addDays, confirmAction } from '../ui.js';

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

export function isBlockDone(d, blockId, key = todayKey()) {
  return !!(d.plan.done && d.plan.done[key] && d.plan.done[key][blockId]);
}

export function toggleBlock(blockId, key = todayKey()) {
  update((d) => {
    d.plan.done = d.plan.done || {};
    const day = d.plan.done[key] = d.plan.done[key] || {};
    if (day[blockId]) delete day[blockId]; else day[blockId] = true;
  });
}

/** How much of today's plan is ticked. */
export function dayProgress(d, key = todayKey()) {
  const total = (d.plan.day || []).length;
  const done = (d.plan.day || []).filter((b) => isBlockDone(d, b.id, key)).length;
  return { done, total };
}

/** Streak of days where at least 70% of the plan was ticked. */
export function planStreak(d) {
  const total = (d.plan.day || []).length;
  if (!total) return 0;
  let cursor = todayKey();
  const hit = (k) => dayProgress(d, k).done / total >= 0.7;
  if (!hit(cursor)) cursor = addDays(cursor, -1);
  let n = 0;
  while (hit(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
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
  const d = getData();
  const { done, total } = dayProgress(d);
  const streak = planStreak(d);

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, '📋 Today, step by step'),
    el('div', { class: 'rowflex' },
      streak > 0 ? el('span', { class: 'chip chip--streak' }, `🔥 ${streak}d`) : null,
      el('span', { class: 'chip' + (total && done === total ? ' chip--key' : '') }, `${done}/${total}`))));

  if (total) {
    const pct = (done / total) * 100;
    card.append(el('div', { class: 'progress' }, el('div', { class: 'progress__fill', style: `width:${pct}%` })));
  }

  const { current } = nowAndNext(plan.day);
  const blocks = [...plan.day].sort((a, b) => (timeToMin(a.time) ?? 0) - (timeToMin(b.time) ?? 0));

  blocks.forEach((b) => {
    const isNow = current && b.id === current.id;
    const ticked = isBlockDone(d, b.id);
    card.append(el('div', { class: 'block' + (isNow ? ' block--now' : '') + (ticked ? ' block--done' : '') },
      el('button', {
        class: 'check check--sm' + (ticked ? ' on' : ''), 'aria-label': 'Tick ' + b.title,
        onClick: () => { toggleBlock(b.id); rerender(); },
      }),
      el('div', { class: 'block__time' }, b.time),
      el('div', { class: 'block__main' },
        el('div', { class: 'block__title' }, (isNow && !ticked ? '▶ ' : '') + b.title),
        b.detail ? el('div', { class: 'block__detail' }, b.detail) : null),
      el('button', { class: 'btn btn--icon', title: 'Remove block', onClick: () => { if (confirmAction(`Remove "${b.title}"?`)) { update((x) => { x.plan.day = x.plan.day.filter((y) => y.id !== b.id); }); rerender(); } } }, '×')));
  });
  if (!blocks.length) card.append(el('div', { class: 'empty muted' }, 'No schedule yet — add blocks below or import a plan patch in Settings.'));

  // add a block
  const time = el('input', { type: 'text', placeholder: '08:00', maxlength: '5', style: 'max-width:86px', inputmode: 'numeric' });
  const title = el('input', { type: 'text', placeholder: 'Block title', maxlength: '60' });
  const detail = el('input', { type: 'text', placeholder: 'Detail (optional)', maxlength: '160' });
  card.append(el('div', { class: 'stack', style: 'margin-top:12px' },
    el('div', { class: 'rowflex' }, time, title),
    detail,
    el('button', { class: 'btn btn--full', onClick: () => {
      if (timeToMin(time.value) === null) { toast('Time like 08:00'); return; }
      if (!title.value.trim()) { toast('Give the block a title'); return; }
      update((x) => { x.plan.day.push({ id: uid(), time: time.value.trim(), title: title.value.trim(), detail: detail.value.trim() }); });
      time.value = ''; title.value = ''; detail.value = '';
      rerender();
    } }, '+ Add block')));
  return card;
}

function sectionCard(s) {
  const body = el('div', { class: 'collapse__body' }, ...s.lines.map((line) => el('div', { class: 'planline' }, line)));
  const head = el('button', { class: 'collapse__head', onClick: () => {
    const open = body.classList.toggle('open');
    head.querySelector('.collapse__arrow').textContent = open ? '▾' : '▸';
  } },
    el('span', {}, `${s.emoji || '•'} ${s.title}`),
    el('span', { class: 'collapse__arrow' }, '▸'));
  return el('div', { class: 'card card--tight' }, head, body);
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
    view.append(el('div', { class: 'section-title' }, 'Protocols · tap to open'));
    plan.sections.forEach((s) => view.append(sectionCard(s)));
  }
  if (plan.updated) view.append(el('div', { class: 'hint', style: 'text-align:center' }, `plan version: ${plan.updated}`));
}

export default { render };
