// ============================================================
// Tasks — quick capture, three buckets (Today / Upcoming /
// Someday), optional project tag (ready for future business
// work), complete + archive.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction } from '../ui.js';

const BUCKETS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'Someday' },
];

export function openTasksToday() {
  return getData().tasks.filter((t) => !t.done && t.bucket === 'today');
}

function addTask(title, bucket, project) {
  update((d) => {
    d.tasks.push({
      id: uid(), title, bucket, project: project || null,
      done: false, createdAt: new Date().toISOString(), completedAt: null,
    });
  });
}

export function toggleTask(id) {
  update((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? new Date().toISOString() : null;
  });
}

function taskRow(t, rerender) {
  return el('div', { class: 'row' + (t.done ? ' done' : '') },
    el('button', {
      class: 'check' + (t.done ? ' on' : ''), 'aria-label': 'Complete',
      onClick: () => { toggleTask(t.id); rerender(); },
    }),
    el('div', { class: 'row__main' },
      el('div', { class: 'row__name' }, t.title),
      t.project ? el('div', { class: 'row__meta' }, el('span', { class: 'chip chip--tag' }, '#' + t.project)) : null,
    ),
    !t.done ? el('button', {
      class: 'btn btn--icon', title: 'Move bucket',
      onClick: () => {
        update((d) => { const x = d.tasks.find((a) => a.id === t.id); const i = BUCKETS.findIndex((b) => b.id === x.bucket); x.bucket = BUCKETS[(i + 1) % BUCKETS.length].id; });
        toast('Moved'); rerender();
      },
    }, '⇄') : null,
    el('button', {
      class: 'btn btn--icon', title: 'Delete',
      onClick: () => { update((d) => { d.tasks = d.tasks.filter((a) => a.id !== t.id); }); rerender(); },
    }, '×'),
  );
}

function addForm(rerender) {
  let bucket = 'today';
  const title = el('input', { type: 'text', placeholder: 'Add a task…', maxlength: '120' });
  const project = el('input', { type: 'text', placeholder: 'project (optional)', maxlength: '24', style: 'max-width:150px' });

  const seg = el('div', { class: 'seg', style: 'margin-top:10px' },
    ...BUCKETS.map((b, i) => el('button', { class: i === 0 ? 'on' : '', onClick: (e) => { bucket = b.id; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.target)); } }, b.label)),
  );

  function submit() {
    const v = title.value.trim();
    if (!v) { toast('Type a task first'); return; }
    addTask(v, bucket, project.value.trim());
    title.value = ''; project.value = '';
    rerender();
  }
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return el('div', { class: 'card' },
    el('div', { class: 'inline-form' }, title, el('button', { class: 'btn btn--primary', onClick: submit }, 'Add')),
    el('div', { class: 'rowflex', style: 'margin-top:10px' }, seg, project),
  );
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  view.append(el('div', { class: 'section-title' }, 'Tasks'));
  view.append(addForm(rerender));

  const d = getData();
  for (const b of BUCKETS) {
    const items = d.tasks.filter((t) => !t.done && t.bucket === b.id);
    view.append(el('div', { class: 'section-title' }, b.label + (items.length ? ` · ${items.length}` : '')));
    const card = el('div', { class: 'card' });
    if (!items.length) card.append(el('div', { class: 'empty muted' }, b.id === 'today' ? 'Nothing due today.' : 'Empty.'));
    items.forEach((t) => card.append(taskRow(t, rerender)));
    view.append(card);
  }

  const done = d.tasks.filter((t) => t.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  if (done.length) {
    view.append(el('div', { class: 'section-title' }, `Done · ${done.length}`));
    const card = el('div', { class: 'card' });
    done.slice(0, 20).forEach((t) => card.append(taskRow(t, rerender)));
    card.append(el('button', { class: 'btn btn--ghost btn--full', style: 'margin-top:10px', onClick: () => { if (confirmAction('Clear all completed tasks?')) { update((dd) => { dd.tasks = dd.tasks.filter((x) => !x.done); }); rerender(); } } }, 'Clear completed'));
    view.append(card);
  }
}

export default { render };
