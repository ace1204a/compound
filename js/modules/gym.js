// ============================================================
// Gym — Strong-style, refined. Library-backed body-part grouping,
// a searchable picker with per-body-part dropdowns + Recent,
// warm-up sets, per-exercise sticky notes (with last-time history),
// drag-to-reorder (with arrow fallback), editable templates that
// use the same picker.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, todayKey, confirmAction, monthMatrix, shiftMonth, monthLabel , restoreScroll } from '../ui.js';

// ---------- exercise library (grouped → reliable body parts) ----------
const LIBRARY_GROUPS = {
  Chest: ['Bench Press', 'Incline Bench Press', 'Incline DB Press', 'DB Bench Press', 'Machine Chest Press', 'Chest Fly', 'Cable Fly', 'Dips', 'Push-ups'],
  Back: ['Pull Ups', 'Chin Ups', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Seated Cable Row', 'T-Bar Row', 'Face Pull', 'Deadlift'],
  Shoulders: ['Overhead Press', 'DB Shoulder Press', 'Arnold Press', 'Lateral Raise', 'Cable Lateral Raise', 'Rear Delt Fly', 'Upright Row'],
  Biceps: ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl', 'Incline Curl'],
  Triceps: ['Tricep Pushdown', 'Cable Tricep Extension', 'Overhead Tricep Extension', 'Skull Crushers', 'Close-Grip Bench'],
  Legs: ['Squat', 'Front Squat', 'Leg Press', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Lunges', 'Leg Extension', 'Leg Curl', 'Calf Raise', 'Hip Thrust'],
  Core: ['Hanging Leg Raise', 'Hanging Knee Raise', 'Cable Crunch', 'Ab Wheel', 'Plank', 'Sit-ups'],
};
const LIB_BP = {};
for (const [bp, names] of Object.entries(LIBRARY_GROUPS)) for (const n of names) LIB_BP[n.toLowerCase()] = bp;

const BP_RULES = [
  [/squat|leg press|leg curl|leg extension|lunge|calf|hip thrust|romanian|rdl|glute|hamstring|quad|split squat/, 'Legs'],
  [/\bab\b|crunch|plank|leg raise|knee raise|\bcore\b|ab wheel|sit.?up|hanging/, 'Core'],
  [/shoulder|overhead press|\bohp\b|lateral|delt|arnold|upright/, 'Shoulders'],
  [/bench|chest|incline|\bfly\b|dip|push.?up|\bpec|db press|dumbbell press/, 'Chest'],
  [/tricep|pushdown|skull|close.?grip|extension/, 'Triceps'],
  [/bicep|curl/, 'Biceps'],
  [/pull.?up|lat pulldown|\blats?\b|\brow\b|deadlift|\bback\b|chin|face pull/, 'Back'],
  [/run|jog|cardio|sprint|erg|bike/, 'Cardio'],
];
function bodyPart(name) {
  const n = (name || '').trim().toLowerCase();
  if (LIB_BP[n]) return LIB_BP[n];              // library = authoritative
  for (const [re, bp] of BP_RULES) if (re.test(n)) return bp;
  return 'Other';
}
const BP_ORDER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio', 'Other'];

function moveItem(arr, i, dir) { const j = i + dir; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

function lastTimeFor(d, exercise) {
  for (const s of d.gym.sessions) {
    const e = (s.entries || []).find((x) => x.exercise.toLowerCase() === (exercise || '').toLowerCase());
    if (e && e.sets.length) return e.sets;
  }
  return null;
}
function lastNoteFor(d, exercise) {
  for (const s of d.gym.sessions) {
    const e = (s.entries || []).find((x) => x.exercise.toLowerCase() === (exercise || '').toLowerCase() && x.note);
    if (e) return { note: e.note, date: s.date };
  }
  return null;
}
function recentExercises(d, limit = 8) {
  const seen = [];
  for (const s of d.gym.sessions) for (const e of (s.entries || [])) {
    if (!seen.some((x) => x.toLowerCase() === e.exercise.toLowerCase())) seen.push(e.exercise);
    if (seen.length >= limit) return seen;
  }
  return seen;
}

// ---------- PRs (skip warm-up sets) ----------
function computePRs(sessions) {
  const prs = {};
  for (const s of sessions) for (const e of s.entries || []) for (const set of e.sets || []) {
    if (set.warmup) continue;
    const kg = +set.kg || 0; if (!kg) continue;
    const cur = prs[e.exercise];
    if (!cur || kg > cur.kg || (kg === cur.kg && (+set.reps || 0) > cur.reps)) prs[e.exercise] = { kg, reps: +set.reps || 0, date: s.date };
  }
  return prs;
}

// ---------- rest timer ----------
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

// ---------- exercise picker (Recent + collapsible body-part groups + search) ----------
let pickerOpen = false;
let pickerTarget = 'draft'; // 'draft' or a template id
let pickerOpenGroups = {};

function makeEntry(d, name) {
  const prev = lastTimeFor(d, name);
  const note = lastNoteFor(d, name);
  return { id: uid(), exercise: name, note: note ? note.note : '', sets: prev ? prev.map((s) => ({ kg: s.kg, reps: s.reps, done: false, warmup: !!s.warmup })) : [{ kg: 0, reps: 0, done: false }] };
}
function pickerAdd(name, rerender) {
  const d = getData();
  if (String(pickerTarget).startsWith('replace:')) {
    const ei = +String(pickerTarget).split(':')[1];
    update((x) => { const fresh = makeEntry(x, name); x.gym.draft.entries[ei] = { ...fresh, id: x.gym.draft.entries[ei].id || fresh.id }; });
    toast('Swapped to ' + name);
    pickerTarget = 'draft';
    return;
  }
  if (pickerTarget === 'draft') {
    update((x) => { x.gym.draft.entries.push(makeEntry(x, name)); });
  } else {
    update((x) => { const t = x.gym.templates.find((a) => a.id === pickerTarget); if (t && !t.exercises.includes(name)) t.exercises.push(name); });
  }
  toast(name + ' added');
}
function pickerPanel(rerender) {
  const d = getData();
  const recent = recentExercises(d);
  const custom = [...new Set(d.gym.sessions.flatMap((s) => (s.entries || []).map((e) => e.exercise)))]
    .filter((n) => !LIB_BP[n.toLowerCase()]);

  const groups = {};
  for (const [bp, names] of Object.entries(LIBRARY_GROUPS)) groups[bp] = [...names];
  for (const n of custom) { const bp = bodyPart(n); (groups[bp] = groups[bp] || []).push(n); }

  const search = el('input', { type: 'text', placeholder: 'Search exercises…', id: 'exSearch' });
  const list = el('div', {});
  function libBtn(n) {
    return el('button', { class: 'libitem', onClick: () => { pickerAdd(n, rerender); pickerOpen = false; rerender(); } },
      n, el('span', { class: 'chip chip--tag', style: 'float:right' }, bodyPart(n)));
  }
  function paint(q = '') {
    list.replaceChildren();
    if (q) {
      const all = [...new Set([...Object.values(LIBRARY_GROUPS).flat(), ...custom])];
      const matches = all.filter((n) => n.toLowerCase().includes(q.toLowerCase())).sort();
      if (!matches.length) { list.append(el('div', { class: 'empty muted' }, 'No match. Add it as a new exercise below.')); return; }
      matches.forEach((n) => list.append(libBtn(n)));
      return;
    }
    if (recent.length) {
      list.append(el('div', { class: 'section-title', style: 'margin:8px 2px 6px' }, '🕑 Recent'));
      recent.forEach((n) => list.append(libBtn(n)));
    }
    BP_ORDER.filter((bp) => groups[bp] && groups[bp].length).forEach((bp) => {
      const open = !!pickerOpenGroups[bp];
      const body = el('div', { class: 'collapse__body' + (open ? ' open' : '') });
      [...new Set(groups[bp])].sort().forEach((n) => body.append(libBtn(n)));
      const head = el('button', { class: 'collapse__head', onClick: () => { pickerOpenGroups[bp] = !pickerOpenGroups[bp]; paint(search.value); } },
        el('span', {}, `${bp} · ${groups[bp].length}`), el('span', { class: 'collapse__arrow' }, open ? '▾' : '▸'));
      list.append(el('div', { class: 'card card--tight', style: 'margin-bottom:6px' }, head, body));
    });
  }
  search.addEventListener('input', () => paint(search.value));
  paint();

  const newName = el('input', { type: 'text', placeholder: 'or type a new one…', maxlength: '60' });
  return el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'Add exercise'), el('button', { class: 'btn btn--sm', onClick: () => { pickerOpen = false; rerender(); } }, 'Close')),
    search,
    el('div', { class: 'inline-form', style: 'margin-top:8px' }, newName,
      el('button', { class: 'btn btn--primary', onClick: () => { const v = newName.value.trim(); if (!v) return; pickerAdd(v, rerender); pickerOpen = false; rerender(); } }, 'Add')),
    list);
}

// ---------- drag reorder (pointer-based, works on touch) ----------
function attachDrag(handle, block, container, commit) {
  handle.style.touchAction = 'none';
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    block.classList.add('dragging');

    const move = (ev) => {
      ev.preventDefault();
      const y = ev.clientY;
      const blocks = [...container.querySelectorAll('.exblock')];
      for (const b of blocks) {
        if (b === block) continue;
        const r = b.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        // b comes after our block in the DOM?
        const bIsAfter = !!(block.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (bIsAfter && y > mid) { container.insertBefore(block, b.nextSibling); break; }
        if (!bIsAfter && y < mid) { container.insertBefore(block, b); break; }
      }
    };
    const up = (ev) => {
      try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
      block.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      commit([...container.querySelectorAll('.exblock')].map((b) => b.dataset.id));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

/** Swipe a set row left to delete it. */
function attachSwipeDelete(row, onDelete) {
  let x0 = null, dx = 0;
  row.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input,button')) return;   // don't hijack the fields
    x0 = e.clientX; dx = 0;
  });
  row.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    if (dx < 0) { row.style.transform = `translateX(${Math.max(dx, -110)}px)`; row.style.opacity = String(1 + dx / 220); }
  });
  const end = () => {
    if (x0 === null) return;
    const shouldDelete = dx < -70;
    row.style.transform = ''; row.style.opacity = '';
    x0 = null;
    if (shouldDelete) onDelete();
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('pointerleave', end);
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

  const exContainer = el('div', {});
  card.append(exContainer);

  draft.entries.forEach((entry, ei) => {
    if (!entry.id) entry.id = uid();
    const prev = lastTimeFor(d, entry.exercise);
    const prevNote = lastNoteFor(d, entry.exercise);
    const block = el('div', { class: 'exblock', 'data-id': entry.id, style: 'border-top:1px solid var(--line);padding:12px 0' });

    const handle = el('button', { class: 'btn btn--icon drag-handle', title: 'Drag to reorder' }, '⠿');
    const name = el('input', { class: 'exname', type: 'text', value: entry.exercise, maxlength: '60' });
    name.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].exercise = name.value.trim() || entry.exercise; }));
    block.append(el('div', { class: 'rowflex' },
      handle,
      el('span', { class: 'chip chip--tag' }, bodyPart(entry.exercise)),
      name,
      el('button', { class: 'btn btn--icon', title: 'Replace with another exercise', onClick: () => { pickerTarget = 'replace:' + ei; pickerOpen = true; rerender(); } }, '⇄'),
      el('button', { class: 'btn btn--icon', title: 'Move up', onClick: () => { update((x) => moveItem(x.gym.draft.entries, ei, -1)); rerender(); } }, '↑'),
      el('button', { class: 'btn btn--icon', title: 'Move down', onClick: () => { update((x) => moveItem(x.gym.draft.entries, ei, 1)); rerender(); } }, '↓'),
      el('button', { class: 'btn btn--icon', title: 'Remove exercise', onClick: () => { update((x) => { x.gym.draft.entries.splice(ei, 1); }); rerender(); } }, '×')));

    // sticky note (above sets) + last-time history
    const note = el('input', { class: 'exnote', type: 'text', placeholder: '📌 note for this exercise…', value: entry.note || '', maxlength: '120' });
    note.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].note = note.value.trim(); }));
    block.append(note);
    if (prevNote && prevNote.note && prevNote.note !== entry.note) block.append(el('div', { class: 'hint', style: 'margin:2px 2px 6px' }, `last time (${prevNote.date}): ${prevNote.note}`));

    block.append(el('div', { class: 'setrow setrow--head' },
      el('span', { class: 'setrow__n' }, '#'), el('span', {}, 'kg'), el('span', {}, 'reps'), el('span', {}, 'prev'), el('span', {}, '✓')));

    entry.sets.forEach((s, si) => {
      const kg = el('input', { type: 'number', value: s.kg || '', min: '0', step: '0.5', inputmode: 'decimal', placeholder: prev && prev[si] ? String(prev[si].kg) : '—' });
      const reps = el('input', { type: 'number', value: s.reps || '', min: '0', inputmode: 'numeric', placeholder: prev && prev[si] ? String(prev[si].reps) : '—' });
      kg.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].sets[si].kg = +kg.value || 0; }));
      reps.addEventListener('change', () => update((x) => { x.gym.draft.entries[ei].sets[si].reps = +reps.value || 0; }));
      const num = el('button', { class: 'setrow__n setrow__wtoggle' + (s.warmup ? ' warm' : ''), title: 'Tap: toggle warm-up set', onClick: () => { update((x) => { const set = x.gym.draft.entries[ei].sets[si]; set.warmup = !set.warmup; }); rerender(); } }, s.warmup ? 'W' : String(si + 1 - entry.sets.slice(0, si).filter((z) => z.warmup).length));
      const prevBtn = el('button', { class: 'setrow__prev', title: 'Fill from last time', onClick: () => { if (!prev || !prev[si]) return; update((x) => { x.gym.draft.entries[ei].sets[si].kg = prev[si].kg; x.gym.draft.entries[ei].sets[si].reps = prev[si].reps; }); rerender(); } }, prev && prev[si] ? `${prev[si].kg}×${prev[si].reps}` : '—');
      const setRow = el('div', { class: 'setrow' + (s.done ? ' setrow--done' : '') + (s.warmup ? ' setrow--warm' : '') },
        num, kg, reps, prevBtn,
        el('button', { class: 'check check--sm' + (s.done ? ' on' : ''), 'aria-label': 'Set done', onClick: () => { update((x) => { const set = x.gym.draft.entries[ei].sets[si]; set.done = !set.done; }); if (!s.done && !s.warmup) startRest(); rerender(); } }));
      attachSwipeDelete(setRow, () => { update((x) => { x.gym.draft.entries[ei].sets.splice(si, 1); }); toast('Set removed'); rerender(); });
      block.append(setRow);
    });

    block.append(el('div', { class: 'rowflex', style: 'margin-top:8px' },
      el('button', { class: 'btn btn--sm', style: 'flex:1', onClick: () => { const last = entry.sets[entry.sets.length - 1] || (prev && prev[entry.sets.length]) || { kg: 0, reps: 0 }; update((x) => { x.gym.draft.entries[ei].sets.push({ kg: last.kg || 0, reps: last.reps || 0, done: false }); }); rerender(); } }, '+ Add set'),
      el('button', { class: 'btn btn--sm btn--ghost', onClick: () => { update((x) => { x.gym.draft.entries[ei].sets.push({ kg: 0, reps: 0, done: false, warmup: true }); }); rerender(); } }, '+ Warm-up')));

    attachDrag(handle, block, exContainer, (order) => update((x) => { x.gym.draft.entries.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }));
    exContainer.append(block);
  });

  card.append(el('button', { class: 'btn btn--full', style: 'margin-top:12px', onClick: () => { pickerTarget = 'draft'; pickerOpen = true; rerender(); } }, '+ Add exercise'));

  const notes = el('input', { type: 'text', placeholder: 'Workout notes (optional)', value: draft.notes || '' });
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

// ---------- templates (edit with the picker) ----------
let editingTpl = null;
function startFromTemplate(t) {
  const d = getData();
  update((x) => { x.gym.draft = { id: uid(), date: todayKey(), name: t.name, notes: '', entries: t.exercises.map((ex) => makeEntry(x, ex)) }; });
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
      card.append(el('div', { style: 'border:1px solid var(--gold-dim);border-radius:12px;padding:12px;margin-bottom:10px' },
        el('div', { class: 'inline-form' }, nm, el('button', { class: 'btn btn--sm', onClick: () => { editingTpl = null; rerender(); } }, 'Done')),
        body,
        el('button', { class: 'btn btn--full', style: 'margin-top:8px', onClick: () => { pickerTarget = t.id; pickerOpen = true; rerender(); } }, '+ Add exercise'),
        pickerOpen && pickerTarget === t.id ? pickerPanel(rerender) : null,
        el('button', { class: 'btn btn--danger btn--full', style: 'margin-top:8px', onClick: () => { if (confirmAction(`Delete template "${t.name}"?`)) { update((x) => { x.gym.templates = x.gym.templates.filter((a) => a.id !== t.id); }); editingTpl = null; rerender(); } } }, 'Delete template')));
      return;
    }
    card.append(el('div', { class: 'row' },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, t.name), el('div', { class: 'row__meta' }, t.exercises.join(' · '))),
      el('button', { class: 'btn btn--icon', title: 'Edit', onClick: () => { editingTpl = t.id; rerender(); } }, '✎'),
      el('button', { class: 'btn btn--sm btn--primary', onClick: () => { startFromTemplate(t); rerender(); } }, 'Start')));
  });

  const name = el('input', { type: 'text', placeholder: 'New template name', maxlength: '40' });
  card.append(el('div', { class: 'stack', style: 'margin-top:10px' }, name,
    el('button', { class: 'btn btn--full', onClick: () => { const n = name.value.trim(); if (!n) { toast('Name it'); return; } update((x) => { x.gym.templates.push({ id: uid(), name: n, exercises: [] }); }); editingTpl = getData().gym.templates.slice(-1)[0].id; name.value = ''; rerender(); } }, '+ New template (then add exercises)'),
    el('button', { class: 'btn btn--ghost btn--full', onClick: () => { update((x) => { x.gym.draft = { id: uid(), date: todayKey(), name: 'Workout', entries: [], notes: '' }; }); pickerTarget = 'draft'; pickerOpen = true; rerender(); } }, 'Empty workout')));
  return card;
}

// ---------- history ----------
let openSession = null;
let gymCal = false;
let gymCalMonth = todayKey().slice(0, 7);
let calSelected = null;

function historyCalendar(rerender) {
  const d = getData();
  const byDate = {};
  for (const s of d.gym.sessions) (byDate[s.date] = byDate[s.date] || []).push(s);
  // cardio counts as a training day too — a run is training
  const cardioByDate = {};
  for (const c of (d.gym.cardio || [])) (cardioByDate[c.date] = cardioByDate[c.date] || []).push(c);
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'rowflex', style: 'margin-bottom:6px' },
    el('button', { class: 'btn btn--icon', onClick: () => { gymCalMonth = shiftMonth(gymCalMonth, -1); rerender(); } }, '‹'),
    el('div', { style: 'flex:1;text-align:center;font-weight:700' }, monthLabel(gymCalMonth)),
    el('button', { class: 'btn btn--icon', onClick: () => { gymCalMonth = shiftMonth(gymCalMonth, 1); rerender(); } }, '›')));
  const grid = el('div', { class: 'cal' });
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((n) => grid.append(el('div', { class: 'cal__dow' }, n)));
  for (const key of monthMatrix(gymCalMonth)) {
    if (!key) { grid.append(el('div', {})); continue; }
    const has = byDate[key];
    const ran = cardioByDate[key];
    const sel = calSelected === key;
    const cls = 'cal__cell' + (has ? ' cal__cell--l3' : ran ? ' cal__cell--l2' : '') + (key === todayKey() ? ' cal__cell--today' : '') + (sel ? ' cal__cell--sel' : '');
    const title = [...(has || []).map((s) => s.name), ...(ran || []).map((c) => `${c.type} ${c.distance || ''}km`)].join(', ') || key;
    grid.append(el('button', { class: cls, title, onClick: () => { calSelected = (calSelected === key ? null : key); rerender(); } }, String(+key.slice(-2))));
  }
  card.append(grid);

  // show the selected day's workout right here, under the calendar
  if (calSelected) {
    const sessions = byDate[calSelected] || [];
    const runsThatDay = cardioByDate[calSelected] || [];
    const panel = el('div', { style: 'border-top:1px solid var(--line);margin-top:12px;padding-top:12px' });
    panel.append(el('div', { class: 'card__title', style: 'margin-bottom:6px' }, calSelected));
    runsThatDay.forEach((c) => {
      panel.append(el('div', { class: 'row__name', style: 'margin-top:6px' }, `🏃 ${c.type}${c.distance ? ' · ' + c.distance + 'km' : ''} · ${c.minutes}min`));
      if (c.note) panel.append(el('div', { class: 'hint' }, '📝 ' + c.note));
    });
    if (!sessions.length && !runsThatDay.length) panel.append(el('div', { class: 'empty muted' }, 'Nothing logged this day.'));
    sessions.forEach((s) => {
      panel.append(el('div', { class: 'row__name', style: 'margin-top:8px' }, s.name));
      (s.entries || []).forEach((e) => {
        panel.append(el('div', { class: 'row__name', style: 'margin-top:6px;font-size:14px' }, e.exercise));
        if (e.note) panel.append(el('div', { class: 'hint' }, '📌 ' + e.note));
        (e.sets || []).forEach((set, i) => panel.append(el('div', { class: 'row__meta' }, `${set.warmup ? 'W' : 'set ' + (i + 1)}: ${set.kg}kg × ${set.reps}${set.done ? ' ✓' : ''}`)));
      });
      panel.append(el('button', { class: 'btn btn--sm btn--full', style: 'margin-top:10px', onClick: () => {
        if (getData().gym.draft) { toast('Finish your current workout first'); return; }
        update((x) => { x.gym.draft = { ...s }; x.gym.sessions = x.gym.sessions.filter((a) => a.id !== s.id); });
        gymCal = false; calSelected = null; rerender(); toast('Loaded for editing');
      } }, '✎ Edit this workout'));
    });
    card.append(panel);
  } else {
    card.append(el('div', { class: 'hint' }, 'Green = trained. Tap a day to see that workout.'));
  }
  return card;
}

function historyCard(rerender) {
  const d = getData();
  if (gymCal) return historyCalendar(rerender);
  const card = el('div', { class: 'card' });
  if (!d.gym.sessions.length) { card.append(el('div', { class: 'empty muted' }, 'No workouts yet. Start one above.')); return card; }
  d.gym.sessions.slice(0, 40).forEach((s) => {
    const sets = (s.entries || []).reduce((n, e) => n + (e.sets || []).length, 0);
    const open = openSession === s.id;
    card.append(el('div', { class: 'row', onClick: (e) => { if (e.target.closest('button')) return; openSession = open ? null : s.id; rerender(); } },
      el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, `${s.name} — ${s.date}`), el('div', { class: 'row__meta' }, `${(s.entries || []).length} exercises · ${sets} sets`)),
      el('button', { class: 'btn btn--icon', title: 'Edit', onClick: () => { if (d.gym.draft) { toast('Finish your current workout first'); return; } update((x) => { x.gym.draft = { ...s }; x.gym.sessions = x.gym.sessions.filter((a) => a.id !== s.id); }); openSession = null; rerender(); toast('Loaded for editing'); } }, '✎'),
      el('button', { class: 'btn btn--icon', onClick: () => { if (confirmAction('Delete this workout?')) { update((x) => { x.gym.sessions = x.gym.sessions.filter((a) => a.id !== s.id); }); rerender(); } } }, '×')));
    if (open) {
      const detail = el('div', { style: 'padding:2px 0 10px 6px' });
      (s.entries || []).forEach((e) => {
        detail.append(el('div', { class: 'row__name', style: 'margin-top:6px' }, e.exercise));
        if (e.note) detail.append(el('div', { class: 'hint' }, '📌 ' + e.note));
        (e.sets || []).forEach((set, i) => detail.append(el('div', { class: 'row__meta' }, `${set.warmup ? 'W' : 'set ' + (i + 1)}: ${set.kg}kg × ${set.reps}${set.done ? ' ✓' : ''}`)));
      });
      card.append(detail);
    }
  });
  return card;
}

// ---------- cardio ----------
function cardioCard(rerender) {
  const d = getData();
  const list = [...(d.gym.cardio || [])].sort((a, b) => b.date.localeCompare(a.date));
  // best 5k = fastest *5k-equivalent* by pace, shown as a time for 5km (not the
  // raw duration of a longer run, which was the old bug)
  const paced = list.filter((c) => c.type === 'Run' && +c.distance >= 3 && +c.minutes > 0);
  const best = paced.length ? paced.reduce((b, r) => (r.minutes / r.distance < b.minutes / b.distance ? r : b)) : null;
  const bestLabel = best ? (() => {
    const t = (best.minutes / best.distance) * 5;
    return `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
  })() : null;

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '🏃 Cardio & engine'),
    best ? el('span', { class: 'chip chip--streak', title: `from ${best.distance}km in ${best.minutes}min on ${best.date}` }, `5k pace best ${bestLabel}`) : null));
  const type = el('select', {}, ...['Run', 'Football', 'Walk', 'Bike', 'Sprints', 'Other'].map((t) => el('option', { value: t }, t)));
  const distance = el('input', { type: 'number', placeholder: 'km', step: '0.1', min: '0', inputmode: 'decimal', style: 'max-width:90px' });
  const minutes = el('input', { type: 'number', placeholder: 'mins', min: '0', inputmode: 'numeric', style: 'max-width:90px' });
  const cdate = el('input', { type: 'date', value: todayKey(), style: 'max-width:150px' });
  const cnote = el('input', { type: 'text', placeholder: 'Run report / how it felt (optional)', maxlength: '400' });
  card.append(el('div', { class: 'stack' },
    el('div', { class: 'rowflex' }, type, distance, minutes, cdate),
    el('div', { class: 'rowflex' }, cnote,
      el('button', { class: 'btn btn--primary', onClick: () => {
        if (!+minutes.value) { toast('How many minutes?'); return; }
        update((x) => { x.gym.cardio = x.gym.cardio || []; x.gym.cardio.unshift({ id: uid(), date: cdate.value || todayKey(), type: type.value, distance: +distance.value || 0, minutes: +minutes.value, note: cnote.value.trim() }); });
        distance.value = ''; minutes.value = ''; cnote.value = ''; toast('Logged 🏃'); rerender();
      } }, 'Log'))));

  list.slice(0, 8).forEach((c) => {
    const pace = (c.distance && c.minutes) ? ` · ${(c.minutes / c.distance).toFixed(2)} min/km` : '';
    const noteIn = el('input', { class: 'exnote', type: 'text', value: c.note || '', placeholder: '📝 run report…', maxlength: '400' });
    noteIn.addEventListener('change', () => { update((x) => { const t = x.gym.cardio.find((y) => y.id === c.id); if (t) t.note = noteIn.value.trim(); }); toast('Saved'); });
    const row = el('div', { style: 'border-top:1px solid var(--line);padding:10px 0' },
      el('div', { class: 'rowflex' },
        el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, `${c.type}${c.distance ? ' · ' + c.distance + 'km' : ''} · ${c.minutes}min`), el('div', { class: 'row__meta' }, c.date + pace)),
        el('button', { class: 'btn btn--icon', onClick: () => { update((x) => { x.gym.cardio = x.gym.cardio.filter((y) => y.id !== c.id); }); rerender(); } }, '×')),
      noteIn);
    card.append(row);
  });
  if (!list.length) card.append(el('div', { class: 'empty muted' }, 'No cardio logged yet.'));
  return card;
}

// ---------- render ----------
function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Gym'));
  if (d.gym.draft) {
    view.append(draftCard(rerender));
    if (pickerOpen && (pickerTarget === 'draft' || String(pickerTarget).startsWith('replace:'))) view.append(pickerPanel(rerender));
  } else {
    view.append(templatesCard(rerender));
  }

  view.append(el('div', { class: 'section-title' }, 'Cardio'));
  view.append(cardioCard(rerender));

  view.append(el('div', { class: 'rowflex' },
    el('div', { class: 'section-title', style: 'flex:1' }, `History · ${d.gym.sessions.length}`),
    el('button', { class: 'btn btn--sm' + (gymCal ? ' btn--primary' : ' btn--ghost'), onClick: () => { gymCal = !gymCal; rerender(); } }, gymCal ? '☰ List' : '📅 Month')));
  view.append(historyCard(rerender));

  // PRs — grouped by body part, in a dropdown below history
  const prs = computePRs(d.gym.sessions);
  const names = Object.keys(prs);
  if (names.length) {
    const body = el('div', { class: 'collapse__body' });
    const groups = {};
    names.forEach((n) => { const bp = bodyPart(n); (groups[bp] = groups[bp] || []).push(n); });
    BP_ORDER.filter((bp) => groups[bp]).forEach((bp) => {
      const gbody = el('div', { class: 'collapse__body' });
      groups[bp].sort((a, b) => prs[b].kg - prs[a].kg).forEach((n) => gbody.append(el('div', { class: 'row' },
        el('div', { class: 'row__main' }, el('div', { class: 'row__name' }, n), el('div', { class: 'row__meta' }, `${prs[n].kg}kg × ${prs[n].reps} · ${prs[n].date}`)),
        el('span', { class: 'chip chip--streak' }, 'PR'))));
      const ghead = el('button', { class: 'collapse__head', onClick: () => { const o = gbody.classList.toggle('open'); ghead.querySelector('.collapse__arrow').textContent = o ? '▾' : '▸'; } },
        el('span', {}, `${bp} · ${groups[bp].length}`), el('span', { class: 'collapse__arrow' }, '▸'));
      body.append(el('div', { class: 'card card--tight', style: 'margin-bottom:6px' }, ghead, gbody));
    });
    const head = el('button', { class: 'collapse__head', onClick: () => { const o = body.classList.toggle('open'); head.querySelector('.collapse__arrow').textContent = o ? '▾' : '▸'; } },
      el('span', {}, `🏆 Personal records · ${names.length}`), el('span', { class: 'collapse__arrow' }, '▸'));
    view.append(el('div', { class: 'card card--tight' }, head, body));
  }
  restoreScroll(y);
}

export default { render };
