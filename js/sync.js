// ============================================================
// sync.js — cloud sync via Supabase (your own free account).
// Dormant until Settings has a URL + key. Offline-first:
// localStorage stays the source of truth; this layer mirrors
// each module to a `modules` table so every device converges.
// Strategy: last-write-wins per module, newest timestamp wins.
// ============================================================

import { getData, replaceAll, save, subscribe, emptyModule } from './store.js';

const SYNC_MODULES = ['habits', 'tasks', 'checkins', 'goals', 'gym', 'diet', 'trading', 'inbox', 'finance', 'books', 'plan'];
const META_KEY = 'compound.sync.meta.v1';

let client = null;
let status = { state: 'off', detail: '' }; // off | ready | signed-in | syncing | error
const statusListeners = new Set();

/** Clean a pasted Supabase URL down to just its origin (no trailing slash,
 *  no path/query) — the #1 cause of "invalid path" sign-in errors. */
export function normalizeUrl(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).origin; } catch { return u.replace(/\/+$/, ''); }
}

/** Drop the cached client so a changed URL/key takes effect without reload. */
export function resetClient() { client = null; }

function setStatus(state, detail = '') {
  status = { state, detail };
  statusListeners.forEach((fn) => fn(status));
}
export function onStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
export function getStatus() { return status; }

function meta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || { lastSyncAt: null, snapshots: {} }; }
  catch { return { lastSyncAt: null, snapshots: {} }; }
}
function saveMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }

function configured() {
  const s = getData().settings.supabase;
  return !!(s && s.url && s.key);
}

/** Load the bundled supabase library (ships inside the app — no third-party
 *  server involved, so it works offline-cached and can't randomly fail). */
function loadLib() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './js/vendor/supabase.js';
    s.onload = () => resolve(window.supabase);
    s.onerror = () => reject(new Error('Could not load the sync library — try reopening the app'));
    document.head.append(s);
  });
}

async function ensureClient() {
  if (client) return client;
  if (!configured()) throw new Error('Sync not configured');
  const { url, key } = getData().settings.supabase;
  const cleanUrl = normalizeUrl(url);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleanUrl)) {
    throw new Error('That doesn’t look like a Supabase Project URL. It should read like https://abcdxyz.supabase.co');
  }
  const lib = await loadLib();
  client = lib.createClient(cleanUrl, (key || '').trim());
  return client;
}

// ---------- auth ----------
export async function signUp(email, password) {
  const c = await ensureClient();
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw error;
}
export async function signIn(email, password) {
  const c = await ensureClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  setStatus('signed-in');
}
export async function signOut() {
  const c = await ensureClient();
  await c.auth.signOut();
  setStatus('ready');
}
export async function currentUser() {
  if (!configured()) return null;
  try {
    const c = await ensureClient();
    const { data } = await c.auth.getUser();
    return data.user || null;
  } catch { return null; }
}

// ---------- sync decision (pure + testable) ----------
/** JSON.stringify with object keys sorted (arrays keep order). Two objects
 *  holding the same DATA always produce the same string, even if their keys
 *  were created in a different order — otherwise devices ping-pong "changes"
 *  that aren't real. */
export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

// Given local data, the remote rows, and the snapshot of what we last
// synced, decide what to pull and what to push. The one ironclad rule:
// an EMPTY module never overwrites a non-empty one. That's what stops a
// fresh device from wiping the cloud.
export function computeSyncActions(local, remote, snapshots) {
  const pulls = {};
  const pushes = [];
  const nextSnapshots = { ...snapshots };

  for (const mod of SYNC_MODULES) {
    const localJson = stableStringify(local[mod]);
    const emptyJson = stableStringify(emptyModule(mod));
    const localIsEmpty = localJson === emptyJson;
    const snap = snapshots[mod];
    const localChanged = snap !== undefined && localJson !== snap;

    const r = remote[mod];
    const remoteExists = !!r;
    const remoteJson = remoteExists ? stableStringify(r.data) : null;
    const remoteIsEmpty = remoteExists && remoteJson === emptyJson;

    let finalJson = localJson;
    if (localChanged && !localIsEmpty) {
      pushes.push(mod);                                   // I made real edits here
    } else if (!localIsEmpty && (!remoteExists || remoteIsEmpty)) {
      pushes.push(mod);                                   // I have data, cloud doesn't → seed it
    } else if (remoteExists && !remoteIsEmpty && remoteJson !== localJson) {
      pulls[mod] = r.data;                                // cloud has the good/newer copy → take it
      finalJson = remoteJson;
    }
    nextSnapshots[mod] = finalJson;
  }
  return { pulls, pushes, nextSnapshots };
}

// ---------- sync core ----------
export async function syncNow() {
  if (!configured()) return { ok: false, reason: 'not configured' };
  const c = await ensureClient();
  const user = await currentUser();
  if (!user) return { ok: false, reason: 'not signed in' };

  setStatus('syncing');
  try {
    const m = meta();
    const d = getData();

    const { data: rows, error } = await c.from('modules').select('module,data,updated_at').eq('user_id', user.id);
    if (error) throw error;
    const remote = Object.fromEntries((rows || []).map((r) => [r.module, r]));

    const { pulls, pushes, nextSnapshots } = computeSyncActions(d, remote, m.snapshots);
    const now = new Date().toISOString();

    const pulledMods = Object.keys(pulls);
    for (const mod of pulledMods) d[mod] = pulls[mod];
    if (pulledMods.length) replaceAll(d);

    const toPush = pushes.map((mod) => ({ user_id: user.id, module: mod, data: d[mod], updated_at: now }));
    if (toPush.length) {
      const { error: upErr } = await c.from('modules').upsert(toPush);
      if (upErr) throw upErr;
    }

    const pulled = pulledMods.length;
    m.snapshots = nextSnapshots;
    m.lastSyncAt = now;
    saveMeta(m);
    setStatus('signed-in', `synced ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    return { ok: true, pulled, pushed: toPush.length };
  } catch (err) {
    console.error('Sync failed:', err);
    setStatus('error', err.message || 'sync failed');
    return { ok: false, reason: err.message };
  }
}

// ---------- auto-sync ----------
let debounceTimer = null;
export async function init() {
  if (!configured()) { setStatus('off'); return; }
  setStatus('ready');
  const user = await currentUser();
  if (user) {
    setStatus('signed-in');
    syncNow();
  }
  subscribe(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (navigator.onLine && (await currentUser())) syncNow();
    }, 4000);
  });
  window.addEventListener('online', () => syncNow());
}
