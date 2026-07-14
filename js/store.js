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
    tasks: [],    // { id, title, bucket:'today'|'upcoming'|'someday', project, done, createdAt, completedAt }
    checkins: {}, // 'YYYY-MM-DD' -> { rating, win, lesson, updatedAt }
    goals: [],    // { id, area, title, why, status:'active'|'done', createdAt }
    gym: {
      templates: [],  // { id, name, exercises:[names] }
      sessions: [],   // { id, date, name, entries:[{ exercise, sets:[{kg,reps}] }], notes }
      draft: null,    // in-progress workout, survives tab switches
    },
    diet: {
      checklist: [],  // { id, name }
      log: {},        // 'YYYY-MM-DD' -> { ruleId: true }
      weights: [],    // { date, kg }
    },
    trading: {
      rules: [],      // { id, text }
      log: {},        // 'YYYY-MM-DD' -> { followed:{ruleId:bool}, note }
    },
    inbox: [],        // { id, url, note, category, status:'new'|'reviewed'|'adopted'|'rejected', verdict, createdAt }
    finance: {
      debts: [],      // { id, name, start, balance, priority }
      months: [],     // { id, month:'YYYY-MM', income, spend, saved }
    },
    books: [],        // { id, title, author, status:'want'|'reading'|'finished', notes, addedAt }
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

/** Small unique id. */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
