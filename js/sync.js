// ============================================================
// sync.js — cloud sync via Supabase (your own free account).
// Dormant until Settings has a URL + key. Offline-first:
// localStorage stays the source of truth; this layer mirrors
// each module to a `modules` table so every device converges.
// Strategy: last-write-wins per module, newest timestamp wins.
// ============================================================

import { getData, replaceAll, save, subscribe } from './store.js';

const SYNC_MODULES = ['habits', 'tasks', 'checkins', 'goals', 'gym', 'diet', 'trading', 'inbox', 'finance', 'books'];
const META_KEY = 'compound.sync.meta.v1';

let client = null;
let status = { state: 'off', detail: '' }; // off | ready | signed-in | syncing | error
const statusListeners = new Set();

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

async function ensureClient() {
  if (client) return client;
  if (!configured()) throw new Error('Sync not configured');
  const { url, key } = getData().settings.supabase;
  const lib = await import('https://esm.sh/@supabase/supabase-js@2');
  client = lib.createClient(url, key);
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

    const localUpdatedAt = d.settings.updatedAt || new Date(0).toISOString();
    const toPush = [];
    let pulled = 0;

    for (const mod of SYNC_MODULES) {
      const localJson = JSON.stringify(d[mod]);
      const localChanged = m.snapshots[mod] !== localJson;
      const r = remote[mod];
      const remoteChanged = r && (!m.lastSyncAt || r.updated_at > m.lastSyncAt);

      if (remoteChanged && (!localChanged || r.updated_at > localUpdatedAt)) {
        d[mod] = r.data;                       // remote wins
        m.snapshots[mod] = JSON.stringify(r.data);
        pulled++;
      } else if (localChanged || !r) {
        toPush.push({ user_id: user.id, module: mod, data: d[mod], updated_at: new Date().toISOString() });
        m.snapshots[mod] = localJson;
      }
    }

    if (pulled) { replaceAll(d); }
    if (toPush.length) {
      const { error: upErr } = await c.from('modules').upsert(toPush);
      if (upErr) throw upErr;
    }

    m.lastSyncAt = new Date().toISOString();
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
