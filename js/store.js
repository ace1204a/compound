// ============================================================
// store.js — the single source of truth.
// Everything the app knows lives in one object, saved to the
// browser's localStorage. When cloud sync arrives (M4) it will
// read/write this same object.
// ============================================================

const STORAGE_KEY = 'compound.appdata.v1';

// The shape of a brand-new, empty app.
function defaultData() {
  return {
    version: 1,
    settings: {
      name: 'Ahmed',
      currency: '£',
      units: 'kg',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      supabase: { url: '', key: '' },
    },
    habits: [],   // { id, name, cadence:'daily'|{perWeek:n}, keystone:bool, createdAt, log:{ 'YYYY-MM-DD': true } }
    daily: {},    // 'YYYY-MM-DD' -> [ { id, text, done } ]  — the frictionless daily checklist
    tasks: [],    // { id, title, date:'YYYY-MM-DD'|null, time:'HH:MM'|null, project, done, order, createdAt, completedAt }
    routines: [], // { id, title, time:'HH:MM'|null, freq:'daily'|{days:[0-6]}, project }  — repeatable tasks
    routineDone: {}, // 'routineId:YYYY-MM-DD' -> true
    dayStatus: {},   // 'YYYY-MM-DD' -> 'working' | 'off'
    checkins: {}, // 'YYYY-MM-DD' -> { rating, win, lesson, updatedAt }
    goals: [],    // { id, area, title, why, status:'active'|'done', createdAt }
    gym: {
      templates: [],  // { id, name, exercises:[names] }
      sessions: [],   // { id, date, name, entries:[{ exercise, sets:[{kg,reps}] }], notes }
      cardio: [],     // { id, date, type, distance, minutes, notes }
      draft: null,    // in-progress workout, survives tab switches
    },
    diet: {
      checklist: [],  // { id, name }
      log: {},        // 'YYYY-MM-DD' -> { ruleId: true }
      intake: {},     // 'YYYY-MM-DD' -> { kcal, protein }  — copied over from MyFitnessPal
      weights: [],    // { date, kg, bf }
      meals: [],      // { id, name, state:'fridge'|'frozen'|'eaten', cookedOn }
    },
    trading: {
      rules: [],      // { id, text }
      log: {},        // 'YYYY-MM-DD' -> { followed:{ruleId:bool}, note, review, tomorrow }
      accounts: null, // { balance, buffer, updatedAt }
    },
    inbox: [],        // { id, url, note, area, status, verdict, score, myNotes, createdAt }
    finance: {
      accounts: [],       // { id, name, balance }  — net worth
      transactions: [],   // { id, date:'YYYY-MM-DD', desc, amount, kind:'in'|'out', account }
      subscriptions: [],  // { id, name, amount, day }  — recurring monthly bills
      debts: [],          // { id, name, start, balance, priority }
      months: [],         // legacy manual monthly summaries (kept for old data)
    },
    books: [],        // { id, title, author, status, notes, highlights:[], sessions:[{date,pages}], addedAt }
    journal: {},      // 'YYYY-MM-DD' -> [ { id, time:'HH:MM', text } ]  — running diary through the day
    coach: {          // the in-app AI coach
      profile: '',    // who the coach is coaching — private, arrives by patch, never in git
      messages: [],   // { id, role:'user'|'assistant', text, at }  — last 60 kept
      model: 'standard', // 'standard' (cheap, daily) | 'deep' (expensive, hard conversations)
    },
    plan: {           // the living protocol — content arrives via plan patches, never hardcoded
      updated: '',
      note: '',
      sleep: null,    // { phase, wake:'HH:MM', bed:'HH:MM' }
      day: [],        // { id, time:'HH:MM', title, detail }
      sections: [],   // { id, emoji, title, lines:[string] }
      done: {},       // 'YYYY-MM-DD' -> { blockId: true }  — ticking off the day as you go
    },
  };
}

// Merge saved data over defaults so new fields added in future
// versions never crash an older save file.
function migrate(saved) {
  const base = defaultData();
  const merged = { ...base, ...saved };
  merged.settings = { ...base.settings, ...(saved.settings || {}) };
  merged.settings.supabase = { ...base.settings.supabase, ...((saved.settings || {}).supabase || {}) };
  merged.gym = { ...base.gym, ...(saved.gym || {}) };
  merged.diet = { ...base.diet, ...(saved.diet || {}) };
  merged.trading = { ...base.trading, ...(saved.trading || {}) };
  merged.finance = { ...base.finance, ...(saved.finance || {}) };
  merged.plan = { ...base.plan, ...(saved.plan || {}) };
  merged.coach = { ...base.coach, ...(saved.coach || {}) };

  // SELF-REPAIR: if any section ended up the wrong shape (e.g. an old app
  // version applied a newer patch file literally and turned a list into an
  // object), fall back to the default shape instead of crashing on load.
  for (const key of Object.keys(base)) {
    const want = base[key], got = merged[key];
    const wantArray = Array.isArray(want);
    const gotArray = Array.isArray(got);
    const badType = wantArray ? !gotArray
      : (want && typeof want === 'object') ? (!got || typeof got !== 'object' || gotArray)
      : false;
    // an object still carrying patch directives is also broken
    const stillAPatch = got && typeof got === 'object' && !gotArray &&
      ('__patchItems' in got || '__append' in got || '__merge' in got || '__remove' in got);
    if (badType || (wantArray && stillAPatch)) {
      console.warn(`Repaired "${key}" — it was the wrong shape, reset to default.`);
      merged[key] = want;
    }
  }
  return merged;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read saved data, starting fresh:', err);
    return defaultData();
  }
}

let data = load();
const listeners = new Set();

/** Get the live data object (read-only intent — mutate via update()). */
export function getData() { return data; }

/** Persist current data and notify anything listening for changes. */
export function save() {
  data.settings.updatedAt = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (err) { console.error('Save failed:', err); }
  listeners.forEach((fn) => fn(data));
}

/** Mutate data safely, then auto-save. */
export function update(mutator) {
  mutator(data);
  save();
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Replace everything (used by Import). */
export function replaceAll(newData) { data = migrate(newData); save(); }

/** Wipe back to empty (used by Settings → reset). */
export function resetAll() { data = defaultData(); save(); }

/** The empty/default value for one module — used by sync to tell
 *  "this device has nothing here" apart from "this device has data". */
export function emptyModule(mod) { return defaultData()[mod]; }

/** Small unique id. */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
