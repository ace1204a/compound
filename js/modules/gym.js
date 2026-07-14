// ============================================================
// Gym — templates, logged sessions, PRs.
// A workout draft lives in the store, so switching tabs
// mid-session never loses your sets.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, confirmAction } from '../ui.js';

// ---------- PRs ----------
function computePRs(sessions) {
  const prs = {}; // exercise -> { kg, reps, date }
  for (const s of sessions) {
    for (const e of s.entries || []) {
      for (const set of e.sets || []) {
        const kg = +set.kg || 0;
        if (!kg) continue;
        const cur = prs[e.exercise];
        if (!cur || kg > cur.kg || (kg === cur.kg && (+set.reps || 0) > cur.reps)) {
          prs[e.exercise] = { kg, reps: +set.reps || 0, date: s.date };
        }
      }
    }
  }
  return prs;
}

// ---------- draft helpers ----------
function startDraft(template) {
  update((d) => {
    d.gym.draft = {
      date: todayKey(),
      name: template ? template.name : 'Workout',
      entries: (template ? template.exercises : []).map((x) => ({ exercise: x, sets: [] })),
      notes: '',
    };
  });
}

// ---------- UI: active workout ----------
function draftCard(rerender) {
  const d = getData();
  const draft = d.gym.draft;

  const card = el('div', { class: 'card card--accent' });
  card.append(el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, `🏋️ ${draft.name} — in progress`),
    el('button', { class: 'btn btn--sm btn--danger', onClick: () => { if (confirmAction('Discard this workout?')) { update((x) => { x.gym.draft = null; }); rerender(); } } }, 'Discard')));

  draft.entries.forEach((entry, ei) => {
    const block = el('div', { style: 'border-top:1px solid var(--line);padding:10px 0' });
    block.append(el('div', { class: 'rowflex' },
      el('div', { class: 'row__name' }, entry.exercise),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--icon', title: 'Remove exercise', onClick: () => { update((x) => { x.gym.draft.entries.splice(ei, 1); }); rerender(); } }, '×')));

    entry.sets.forEach((s, si) => {
      block.append(el('div', { class: 'rowflex', style: 'margin-top:6px' },
        el('span', { class: 'chip' }, `set ${si + 1}`),
        el('span', { class: 'muted' }, `${s.kg} kg × ${s.reps}`),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.gym.draft.entries[ei].sets.splice(si, 1); }); rerender(); } }, '×')));
    });

    const kg = el('input', { type: 'number', placeholder: 'kg', min: '0', step: '0.5', style: 'max-width:90px', inputmode: 'decimal' });
    const reps = el('input', { type: 'number', placeholder: 'reps', min: '0', style: 'max-width:90px', inputmode: 'numeric' });
    block.append(el('div', { class: 'rowflex', style: 'margin-top:8px' }, kg, reps,
      el('button', { class: 'btn btn--sm', onClick: () => {
        if (!+kg.value && +kg.value !== 0) { toast('Enter the weight'); return; }
        if (!+reps.value) { toast('Enter the reps'); return; }
        update((x) => { x.gym.draft.entries[ei].sets.push({ kg: +kg.value, reps: +reps.value }); });
        rerender();
      } }, '+ set')));
    card.append(block);
  });

  // add exercise
  const exName = el('input', { type: 'text', placeholder: 'Add exercise — e.g. Incline DB press', maxlength: '60' });
  card.append(el('div', { class: 'inline-form', style: 'margin-top:10px' }, exName,
    el('button', { class: 'btn', onClick: () => {
      const v = exName.value.trim(); if (!v) return;
      update((x) => { x.gym.draft.entries.push({ exercise: v, sets: [] }); });
      rerender();
    } }, 'Add')));

  const notes = el('input', { type: 'text', placeholder: 'Notes (optional)', value: draft.notes || '' });
  notes.addEventListener('change', () => update((x) => { x.gym.draft.notes = notes.value; }));
  card.append(el('div', { style: 'margin-top:10px' }, notes));

  card.append(el('button', { class: 'btn btn--primary btn--full', style: 'margin-top:12px', onClick: () => {
    const total = draft.entries.reduce((n, e) => n + e.sets.length, 0);
    if (!total) { toast('Log at least one set'); return; }
    update((x) => {
      x.gym.sessions.unshift({ id: uid(), ...x.gym.draft });
      x.gym.draft = null;
    });
    toast('Workout saved 💪'); rerender();
  } }, 'Finish workout'));

  return card;
}

// ---------- UI: templates ----------
function templatesCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Templates'),
    el('span', { class: 'card__sub' }, 'tap to start')));

  d.gym.templates.forEach((t) => {
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' },
        el('div', { class: 'row__name' }, t.name),
        el('div', { class: 'row__meta' }, t.exercises.join(' · '))),
      el('button', { class: 'btn btn--sm btn--primary', onClick: () => { startDraft(t); rerender(); } }, 'Start'),
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction(`Delete template "${t.name}"?`)) { update((x) => { x.gym.templates = x.gym.templates.filter((a) => a.id !== t.id); }); rerender(); } } }, '×')));
  });

  const name = el('input', { type: 'text', placeholder: 'Template name — e.g. Push', maxlength: '40' });
  const exs = el('input', { type: 'text', placeholder: 'Exercises, comma-separated', maxlength: '300' });
  card.append(el('div', { class: 'stack', style: 'margin-top:10px' }, name, exs,
    el('button', { class: 'btn btn--full', onClick: () => {
      const n = name.value.trim();
      const list = exs.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!n || !list.length) { toast('Name + at least one exercise'); return; }
      update((x) => { x.gym.templates.push({ id: uid(), name: n, exercises: list }); });
      name.value = ''; exs.value = '';
      toast('Template saved'); rerender();
    } }, '+ Add template'),
    el('button', { class: 'btn btn--ghost btn--full', onClick: () => { startDraft(null); rerender(); } }, 'Or start a blank workout')));
  return card;
}

// ---------- render ----------
function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Gym'));
  if (d.gym.draft) view.append(draftCard(rerender));
  else view.append(templatesCard(rerender));

  // PRs
  const prs = computePRs(d.gym.sessions);
  const names = Object.keys(prs);
  if (names.length) {
    view.append(el('div', { class: 'section-title' }, 'Personal records'));
    const c = el('div', { class: 'card' });
    names.sort((a, b) => prs[b].kg - prs[a].kg).forEach((n) => {
      c.append(el('div', { class: 'row' },
        el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, n),
          el('div', { class: 'row__meta' }, `${prs[n].kg} kg × ${prs[n].reps} · ${prs[n].date}`)),
        el('span', { class: 'chip chip--streak' }, 'PR')));
    });
    view.append(c);
  }

  // history
  view.append(el('div', { class: 'section-title' }, `History · ${d.gym.sessions.length}`));
  const h = el('div', { class: 'card' });
  if (!d.gym.sessions.length) h.append(el('div', { class: 'empty muted' }, 'No workouts logged yet. Start one above — even 3 sets counts.'));
  d.gym.sessions.slice(0, 30).forEach((s) => {
    const sets = (s.entries || []).reduce((n, e) => n + (e.sets || []).length, 0);
    h.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' },
        el('div', { class: 'row__name' }, `${s.name} — ${s.date}`),
        el('div', { class: 'row__meta' }, `${(s.entries || []).length} exercises · ${sets} sets${s.notes ? ' · ' + s.notes : ''}`)),
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction('Delete this workout?')) { update((x) => { x.gym.sessions = x.gym.sessions.filter((a) => a.id !== s.id); }); rerender(); } } }, '×')));
  });
  view.append(h);
}

export default { render };
