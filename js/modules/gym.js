// ============================================================
// Gym — Strong-style. Templates, an inline-editable live workout
// with a rest timer, per-set done ticks, tap-previous-to-fill,
// an exercise library, reordering, viewing + editing past
// workouts, and PRs grouped by body part.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, confirmAction } from '../ui.js';

// ---------- body-part inference (order matters) ----------
const BP_RULES = [
  [/squat|leg press|leg curl|leg extension|lunge|calf|hip thrust|romanian|rdl|glute|hamstring|quad/, 'Legs'],
  [/\bab\b|crunch|plank|leg raise|knee raise|\bcore\b|ab wheel|hanging/, 'Core'],
  [/shoulder|overhead press|\bohp\b|lateral|lat raise|delt|arnold|upright/, 'Shoulders'],
  [/bench|chest|incline|\bfly\b|dip|push.?up|\bpec|db press|dumbbell press/, 'Chest'],
  [/tricep|pushdown|skull|close.?grip|extension/, 'Triceps'],
  [/bicep|curl/, 'Biceps'],
  [/pull.?up|lat pulldown|\blats?\b|\brow\b|deadlift|\bback\b|chin|face pull/, 'Back'],
  [/run|jog|cardio|sprint|erg|bike/, 'Cardio'],
];
function bodyPart(name) { const n = (name || '').toLowerCase(); for (const [re, bp] of BP_RULES) if (re.test(n)) return bp; return 'Other'; }
const BP_ORDER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio', 'Other'];

const LIBRARY = [
  'Bench Press', 'Incline Bench Press', 'Incline DB Press', 'DB Bench Press', 'Chest Fly', 'Cable Fly', 'Dips', 'Push-ups',
  'Pull Ups', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Seated Cable Row', 'Face Pull', 'Deadlift', 'T-Bar Row',
  'Overhead Press', 'DB Shoulder Press', 'Lateral Raise', 'Rear Delt Fly', 'Arnold Press', 'Upright Row',
  'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl',
  'Tricep Pushdown', 'Overhead Tricep Extension', 'Skull Crushers', 'Close-Grip Bench', 'Cable Tricep Extension',
  'Squat', 'Front Squat', 'Leg Press', 'Romanian Deadlift', 'Leg Extension', 'Leg Curl', 'Lunges', 'Calf Raise', 'Hip Thrust',
  'Hanging Leg Raise', 'Cable Crunch', 'Plank', 'Ab Wheel',
];

function moveItem(arr, i, dir) { const j = i + dir; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

// last time this exercise was trained → its sets (for "previous" + prefill)
function lastTimeFor(d, exercise) {
  for (const s of d.gym.sessions) {
    const e = (s.entries || []).find((x) => x.exercise.toLowerCase() === (exercise || '').toLowerCase());
    if (e && e.sets.length) return e.sets;
  }
  return null;
}

// ---------- PRs grouped by body part ----------
function computePRs(sessions) {
  const prs = {};
  for (const s of sessions) for (const e of s.entries || []) for (const set of e.sets || []) {
    const kg = +set.kg || 0; if (!kg) continue;
    const cur = prs[e.exercise];
    if (!cur || kg > cur.kg || (kg === cur.kg && (+set.reps || 0) > cur.reps)) prs[e.exercise] = { kg, reps: +set.reps || 0, date: s.date };
  }
  return prs;
}

// ---------- rest timer (survives re-renders) ----------
let rest = { endTime: 0, duration: 90 };
let restLoop = null;
function ensureRestLoop() {
  if (restLoop) return;
  restLoop = setInterval(() => {
    const disp = document.getElementById('restDisp'); if (!disp) return;
    const left = Math.max(0, Math.ceil((rest.endTime - Date.now()) / 1000));
    disp.textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'rest';
    const bar = document.getElementById('restBar');
    if (bar) bar.style.width = (rest.endTime > Date.now() ? (left / rest.duration) * 100 : 0) + '%';
    if (left === 0 && rest.endTime && rest.endTime <= Date.now()) { rest.endTime = 0; if (navigator.vibrate) navigator.vibrate(200); }
  }, 250);
}
function startRest() { rest.endTime = Date.now() + rest.duration * 1000; }
function restWidget() {
  ensureRestLoop();
  return el('div', { class: 'rest' },
    el('div', { class: 'rest__bar' }, el('div', { class: 'rest__fill', id: 'restBar' })),
    el('div', { class: 'rowflex', style: 'margin-top:6px' },
      el('button', { class: 'btn btn--icon', onClick: () => { rest.duration = Math.max(15, rest.duration - 15); startRest(); } }, '−15'),
      el('span', { class: 'rest__disp', id: 'restDisp' }, `${Math.floor(rest.duration / 60)}:${String(rest.duration % 60).padStart(2, '0')}`),
      el('button', { class: 'btn btn--icon', onClick: () => { rest.duration += 15; startRest(); } }, '+15'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--sm', onClick: () => startRest() }, 'Start rest'),
      el('button', { class: 'btn btn--sm btn--ghost', onClick: () => { rest.endTime = 0; } }, 'Skip')));
}

// ---------- exercise picker (library + your history) ----------
let pickerOpen = false;
function addExerciseToDraft(name) {
  const d = getData();
  const prev = lastTimeFor(d, name);
  const sets = prev ? prev.map((s) => ({ kg: s.kg, reps: s.reps, done: false })) : [{ kg: 0, reps: 0, done: false }];
  update((x) => { x.gym.draft.entries.push({ exercise: name, sets }); });
}
function pickerPanel(rerender) {
  const d = getData();
  const histNames = [...new Set(d.gym.sessions.flatMap((s) => (s.entries || []).map((e) => e.exercise)))];
  const all = [...new Set([...histNames, ...LIBRARY])];
  const groups = {};
  all.forEach((n) => { const bp = bodyPart(n); (groups[bp] = groups[bp] || []).push(n); });

  const search = el('input', { type: 'text', placeholder: 'Search exercises…', id: 'exSearch' });
  const list = el('div', {});
  function paint(q = '') {
    list.replaceChildren();
    BP_ORDER.filter((bp) => groups[bp]).forEach((bp) => {
      const matches = groups[bp].filter((n) => n.toLowerCase().includes(q.toLowerCase())).sort();
      if (!matches.length) return;
      list.append(el('div', { class: 'section-title', style: 'margin:12px 2px 6px' }, bp));
      matches.forEach((n) => list.append(el('button', { class: 'libitem', onClick: () => { addExerciseToDraft(n); toast(n + ' added'); pickerOpen = false; rerender(); } },
        n, histNames.includes(n) ? el('span', { class: 'chip', style: 'float:right' }, 'history') : null)));
    });
  }
  search.addEventListener('input', () => paint(search.value));
  paint();

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Add exercise'), el('button', { class: 'btn btn--sm', onClick: () => { pickerOpen = false; rerender(); } }, 'Close')),
    search,
    el('div', { class: 'inline-form', style: 'margin-top:8px' },
      el('input', { type: 'text', placeholder: 'or type a new one…', id: 'exNew', maxlength: '60' }),
      el('button', { class: 'btn btn--primary', onClick: () => { const v = document.getElementById('exNew').value.trim(); if (!v) return; addExerciseToDraft(v); toast(v + ' added'); pickerOpen = false; rerender(); } }, 'Add')),
    list);
}

// ---------- live workout ----------
function draftCard(rerender) {
  const d = getData();
  const draft = d.gym.draft;
  const card = el('div', { class: 'card card--accent' });

  const nameIn = el('input', { class: 'exname', type: 'text', value: draft.name, maxlength: '40', style: 'font-size:17px' });
  nameIn.addEventListener('change', () => update((x) => { x.gym.draft.name = nameIn.value.trim() || 'Workout'; }));
  card.append(el('div', { class: 'rowflex' }, nameIn,
    el('button', { class: 'btn btn--sm btn--danger', onClick: () => { if (confirmAction('Discard this workout?')) { update((x) => { x.gym.draft = null; }); rerender(); } } }, 'Discard')));

  card.append(restWidget());

  draft.entries.forEach((entry, ei) => {
    const prev = lastTimeFor(d, entry.exercise);
    const block = el('div', { style: 'border-top:1px solid var(--line);padding:12px 0' });

    const name = el('input', { class: 'exname', type: 'text', value: entry.exercise, maxlength: '60' });
    name.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].exercise = name.value.trim() || entry.exercise; }));
    block.append(el('div', { class: 'rowflex' },
      el('span', { class: 'chip chip--tag' }, bodyPart(entry.exercise)),
      name,
      el('button', { class: 'btn btn--icon', title: 'Move up', onClick: () => { update((x) => moveItem(x.gym.draft.entries, ei, -1)); rerender(); } }, '↑'),
      el('button', { class: 'btn btn--icon', title: 'Move down', onClick: () => { update((x) => moveItem(x.gym.draft.entries, ei, 1)); rerender(); } }, '↓'),
      el('button', { class: 'btn btn--icon', title: 'Remove exercise', onClick: () => { update((x) => { x.gym.draft.entries.splice(ei, 1); }); rerender(); } }, '×')));

    block.append(el('div', { class: 'setrow setrow--head' },
      el('span', { class: 'setrow__n' }, '#'), el('span', {}, 'kg'), el('span', {}, 'reps'), el('span', {}, 'prev'), el('span', {}, '✓')));

    entry.sets.forEach((s, si) => {
      const kg = el('input', { type: 'number', value: s.kg || '', min: '0', step: '0.5', inputmode: 'decimal', placeholder: prev && prev[si] ? String(prev[si].kg) : '—' });
      const reps = el('input', { type: 'number', value: s.reps || '', min: '0', inputmode: 'numeric', placeholder: prev && prev[si] ? String(prev[si].reps) : '—' });
      kg.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].sets[si].kg = +kg.value || 0; }));
      reps.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].sets[si].reps = +reps.value || 0; }));
      const prevBtn = el('button', { class: 'setrow__prev', title: 'Tap to fill from last time', onClick: () => {
        if (!prev || !prev[si]) return;
        update((x) => { x.gym.draft.entries[ei].sets[si].kg = prev[si].kg; x.gym.draft.entries[ei].sets[si].reps = prev[si].reps; });
        rerender();
      } }, prev && prev[si] ? `${prev[si].kg}×${prev[si].reps}` : '—');
      block.append(el('div', { class: 'setrow' + (s.done ? ' setrow--done' : '') },
        el('span', { class: 'setrow__n' }, si + 1), kg, reps, prevBtn,
        el('button', { class: 'check check--sm' + (s.done ? ' on' : ''), 'aria-label': 'Set done', onClick: () => {
          update((x) => { const set = x.gym.draft.entries[ei].sets[si]; set.done = !set.done; });
          if (!s.done) startRest(); // starting rest as you complete a set
          rerender();
        } })));
    });

    block.append(el('button', { class: 'btn btn--sm btn--full', style: 'margin-top:8px', onClick: () => {
      const last = entry.sets[entry.sets.length - 1] || (prev && prev[entry.sets.length]) || { kg: 0, reps: 0 };
      update((x) => { x.gym.draft.entries[ei].sets.push({ kg: last.kg || 0, reps: last.reps || 0, done: false }); });
      rerender();
    } }, '+ Add set'));
    card.append(block);
  });

  card.append(el('button', { class: 'btn btn--full', style: 'margin-top:12px', onClick: () => { pickerOpen = true; rerender(); } }, '+ Add exercise'));

  const notes = el('input', { type: 'text', placeholder: 'Notes (optional)', value: draft.notes || '' });
  notes.addEventListener('change', () => update((x) => { x.gym.draft.notes = notes.value; }));
  card.append(el('div', { style: 'margin-top:10px' }, notes));

  card.append(el('button', { class: 'btn btn--primary btn--full', style: 'margin-top:12px', onClick: () => {
    const total = draft.entries.reduce((n, e) => n + e.sets.length, 0);
    if (!total) { toast('Log at least one set'); return; }
    update((x) => { x.gym.sessions.unshift({ id: draft.id || uid(), ...x.gym.draft, date: x.gym.draft.date || todayKey() }); x.gym.draft = null; });
    rest.endTime = 0; toast('Workout saved 💪'); rerender();
  } }, 'Finish workout'));
  return card;
}

// ---------- templates (view + edit) ----------
let editingTpl = null;
function startFromTemplate(t) {
  const d = getData();
  update((x) => {
    x.gym.draft = {
      id: uid(), date: todayKey(), name: t.name, notes: '',
      entries: t.exercises.map((ex) => {
        const prev = lastTimeFor(d, ex);
        return { exercise: ex, sets: prev ? prev.map((s) => ({ kg: s.kg, reps: s.reps, done: false })) : [{ kg: 0, reps: 0, done: false }] };
      }),
    };
  });
}
function templatesCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Templates'), el('span', { class: 'card__sub' }, 'start or edit')));

  d.gym.templates.forEach((t) => {
    if (editingTpl === t.id) {
      const nm = el('input', { type: 'text', value: t.name, maxlength: '40' });
      nm.addEventListener('change', () => update((x) => { x.gym.templates.find((a) => a.id === t.id).name = nm.value.trim() || t.name; }));
      const body = el('div', {});
      t.exercises.forEach((ex, i) => body.append(el('div', { class: 'row' },
        el('div', { class: 'row__main' }, el('span', { class: 'chip chip--tag' }, bodyPart(ex)), ' ' + ex),
        el('button', { class: 'btn btn--icon', onClick: () => { update((x) => moveItem(x.gym.templates.find((a) => a.id === t.id).exercises, i, -1)); rerender(); } }, '↑'),
        el('button', { class: 'btn btn--icon', onClick: () => { update((x) => moveItem(x.gym.templates.find((a) => a.id === t.id).exercises, i, 1)); rerender(); } }, '↓'),
        el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { const tt = x.gym.templates.find((a) => a.id === t.id); tt.exercises.splice(i, 1); }); rerender(); } }, '×'))));
      const addEx = el('input', { type: 'text', placeholder: 'add exercise', maxlength: '60' });
      card.append(el('div', { class: 'card--tight', style: 'border:1px solid var(--gold-dim);border-radius:12px;padding:12px;margin-bottom:10px' },
        el('div', { class: 'inline-form' }, nm, el('button', { class: 'btn btn--sm', onClick: () => { editingTpl = null; rerender(); } }, 'Done')),
        body,
        el('div', { class: 'inline-form', style: 'margin-top:8px' }, addEx, el('button', { class: 'btn', onClick: () => { const v = addEx.value.trim(); if (!v) return; update((x) => { x.gym.templates.find((a) => a.id === t.id).exercises.push(v); }); rerender(); } }, 'Add')),
        el('button', { class: 'btn btn--danger btn--full', style: 'margin-top:8px', onClick: () => { if (confirmAction(`Delete template "${t.name}"?`)) { update((x) => { x.gym.templates = x.gym.templates.filter((a) => a.id !== t.id); }); editingTpl = null; rerender(); } } }, 'Delete template')));
      return;
    }
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, t.name), el('div', { class: 'row__meta' }, t.exercises.join(' · '))),
      el('button', { class: 'btn btn--icon', title: 'Edit', onClick: () => { editingTpl = t.id; rerender(); } }, '✎'),
      el('button', { class: 'btn btn--sm btn--primary', onClick: () => { startFromTemplate(t); rerender(); } }, 'Start')));
  });

  const name = el('input', { type: 'text', placeholder: 'New template name', maxlength: '40' });
  const exs = el('input', { type: 'text', placeholder: 'exercises, comma-separated', maxlength: '300' });
  card.append(el('div', { class: 'stack', style: 'margin-top:10px' }, name, exs,
    el('button', { class: 'btn btn--full', onClick: () => {
      const n = name.value.trim(); const list = exs.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!n || !list.length) { toast('Name + at least one exercise'); return; }
      update((x) => { x.gym.templates.push({ id: uid(), name: n, exercises: list }); });
      name.value = ''; exs.value = ''; toast('Template saved'); rerender();
    } }, '+ Add template'),
    el('button', { class: 'btn btn--ghost btn--full', onClick: () => { update((x) => { x.gym.draft = { id: uid(), date: todayKey(), name: 'Workout', entries: [], notes: '' }; }); pickerOpen = true; rerender(); } }, 'Empty workout')));
  return card;
}

// ---------- history (view + edit past) ----------
let openSession = null;
function historyCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  if (!d.gym.sessions.length) { card.append(el('div', { class: 'empty muted' }, 'No workouts yet. Start one above.')); return card; }

  d.gym.sessions.slice(0, 40).forEach((s) => {
    const sets = (s.entries || []).reduce((n, e) => n + (e.sets || []).length, 0);
    const open = openSession === s.id;
    card.append(el('div', { class: 'row', onClick: (e) => { if (e.target.closest('button')) return; openSession = open ? null : s.id; rerender(); } },
      el('div', { class: 'row__main' },
        el('div', { class: 'row__name' }, `${s.name} — ${s.date}`),
        el('div', { class: 'row__meta' }, `${(s.entries || []).length} exercises · ${sets} sets${s.notes ? ' · ' + s.notes : ''}`)),
      el('button', { class: 'btn btn--icon', onClick: () => {
        if (d.gym.draft) { toast('Finish your current workout first'); return; }
        update((x) => { x.gym.draft = { ...s }; x.gym.sessions = x.gym.sessions.filter((a) => a.id !== s.id); });
        openSession = null; rerender(); toast('Loaded for editing');
      }, title: 'Edit' }, '✎'),
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction('Delete this workout?')) { update((x) => { x.gym.sessions = x.gym.sessions.filter((a) => a.id !== s.id); }); rerender(); } } }, '×')));
    if (open) {
      const detail = el('div', { style: 'padding:2px 0 10px 6px' });
      (s.entries || []).forEach((e) => {
        detail.append(el('div', { class: 'row__name', style: 'margin-top:6px' }, e.exercise));
        (e.sets || []).forEach((set, i) => detail.append(el('div', { class: 'row__meta' }, `set ${i + 1}: ${set.kg}kg × ${set.reps}${set.done ? ' ✓' : ''}`)));
      });
      card.append(detail);
    }
  });
  return card;
}

// ---------- render ----------
function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Gym'));
  if (d.gym.draft) {
    view.append(draftCard(rerender));
    if (pickerOpen) view.append(pickerPanel(rerender));
  } else {
    view.append(templatesCard(rerender));
    if (pickerOpen) pickerOpen = false;
  }

  view.append(el('div', { class: 'section-title' }, 'Cardio'));
  view.append(cardioCard(rerender));

  view.append(el('div', { class: 'section-title' }, `History · ${d.gym.sessions.length}`));
  view.append(historyCard(rerender));

  // PRs — grouped by body part, tucked into a dropdown below history
  const prs = computePRs(d.gym.sessions);
  const names = Object.keys(prs);
  if (names.length) {
    const body = el('div', { class: 'collapse__body' });
    const groups = {};
    names.forEach((n) => { const bp = bodyPart(n); (groups[bp] = groups[bp] || []).push(n); });
    BP_ORDER.filter((bp) => groups[bp]).forEach((bp) => {
      body.append(el('div', { class: 'section-title', style: 'margin:10px 2px 4px' }, bp));
      groups[bp].sort((a, b) => prs[b].kg - prs[a].kg).forEach((n) => body.append(el('div', { class: 'row' },
        el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, n), el('div', { class: 'row__meta' }, `${prs[n].kg}kg × ${prs[n].reps} · ${prs[n].date}`)),
        el('span', { class: 'chip chip--streak' }, 'PR'))));
    });
    const head = el('button', { class: 'collapse__head', onClick: () => { const o = body.classList.toggle('open'); head.querySelector('.collapse__arrow').textContent = o ? '▾' : '▸'; } },
      el('span', {}, `🏆 Personal records · ${names.length}`), el('span', { class: 'collapse__arrow' }, '▸'));
    view.append(el('div', { class: 'card card--tight' }, head, body));
  }
}

// ---------- cardio (unchanged behaviour) ----------
function cardioCard(rerender) {
  const d = getData();
  const list = [...(d.gym.cardio || [])].sort((a, b) => b.date.localeCompare(a.date));
  const runs = list.filter((c) => c.type === 'Run' && +c.distance >= 4.5 && +c.minutes > 0);
  const best = runs.length ? runs.reduce((b, r) => (r.minutes / r.distance < b.minutes / b.distance ? r : b)) : null;

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '🏃 Cardio & engine'), best ? el('span', { class: 'chip chip--streak' }, `5k best ${best.minutes}min`) : null));
  const type = el('select', {}, ...['Run', 'Football', 'Walk', 'Bike', 'Sprints', 'Other'].map((t) => el('option', { value: t }, t)));
  const distance = el('input', { type: 'number', placeholder: 'km', step: '0.1', min: '0', inputmode: 'decimal', style: 'max-width:90px' });
  const minutes = el('input', { type: 'number', placeholder: 'mins', min: '0', inputmode: 'numeric', style: 'max-width:90px' });
  card.append(el('div', { class: 'rowflex' }, type, distance, minutes,
    el('button', { class: 'btn', onClick: () => { if (!+minutes.value) { toast('How many minutes?'); return; } update((x) => { x.gym.cardio = x.gym.cardio || []; x.gym.cardio.unshift({ id: uid(), date: todayKey(), type: type.value, distance: +distance.value || 0, minutes: +minutes.value }); }); distance.value = ''; minutes.value = ''; toast('Logged 🏃'); rerender(); } }, 'Log')));
  list.slice(0, 6).forEach((c) => {
    const pace = (c.distance && c.minutes) ? ` · ${(c.minutes / c.distance).toFixed(1)} min/km` : '';
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, `${c.type}${c.distance ? ' · ' + c.distance + 'km' : ''} · ${c.minutes}min`), el('div', { class: 'row__meta' }, c.date + pace)),
      el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.gym.cardio = x.gym.cardio.filter((y) => y.id !== c.id); }); rerender(); } }, '×')));
  });
  if (!list.length) card.append(el('div', { class: 'empty muted' }, 'No cardio logged yet.'));
  return card;
}

export default { render };
