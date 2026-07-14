// ============================================================
// Settings — name, data safety net (export/import/reset),
// cloud sync connection, and the Coach Brief: one tap copies
// a summary of your recent data to paste to Claude.
// ============================================================

import { getData, update, replaceAll, resetAll } from '../store.js';
import { el, toast, confirmAction, todayKey, addDays } from '../ui.js';
import * as sync from '../sync.js';
import { computeStreaks } from './habits.js';
import { cleanStreak } from './diet.js';
import { cleanRun } from './trading.js';

function exportData() {
  const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `compound-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}

function importData(file, rerender) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object' || !('habits' in parsed)) throw new Error('Not a Compound backup');
      if (!confirmAction('Replace ALL current data on this device with this file?')) return;
      replaceAll(parsed);
      toast('Data loaded ✓');
      rerender();
    } catch (err) { toast('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
}

// ---------- Coach brief ----------
function buildBrief() {
  const d = getData();
  const lines = [`COMPOUND COACH BRIEF — ${todayKey()}`, ''];

  if (d.habits.length) {
    lines.push('HABITS:');
    d.habits.forEach((h) => {
      const s = computeStreaks(h);
      const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i - 6)).filter((k) => h.log && h.log[k]).length;
      lines.push(`- ${h.name}${h.keystone ? ' [non-negotiable]' : ''}: streak ${s.current} (best ${s.best}), ${last7}/7 this week`);
    });
    lines.push('');
  }

  const checkKeys = Object.keys(d.checkins).sort().slice(-7);
  if (checkKeys.length) {
    lines.push('LAST CHECK-INS:');
    checkKeys.forEach((k) => {
      const c = d.checkins[k];
      lines.push(`- ${k}: ${c.rating}/10${c.win ? ' | win: ' + c.win : ''}${c.lesson ? ' | lesson: ' + c.lesson : ''}`);
    });
    lines.push('');
  }

  if (d.diet.checklist.length) lines.push(`DIET: clean-day streak ${cleanStreak(d)}`);
  if (d.trading.rules.length) lines.push(`TRADING: ${cleanRun(d)} clean sessions in a row (${Object.keys(d.trading.log).length} logged)`);
  if (d.gym.sessions.length) lines.push(`GYM: ${d.gym.sessions.length} workouts logged, last ${d.gym.sessions[0].date} (${d.gym.sessions[0].name})`);
  const debtNow = d.finance.debts.reduce((n, x) => n + (+x.balance || 0), 0);
  const debtStart = d.finance.debts.reduce((n, x) => n + (+x.start || 0), 0);
  if (debtStart) lines.push(`MONEY: debt £${debtNow.toLocaleString('en-GB')} (started £${debtStart.toLocaleString('en-GB')})`);
  const weights = d.diet.weights;
  if (weights.length) lines.push(`WEIGHT: ${weights[weights.length - 1].kg} kg (${weights.length} entries)`);
  const newInbox = d.inbox.filter((i) => i.status === 'new').length;
  if (newInbox) lines.push(`INBOX: ${newInbox} items waiting for review`);

  return lines.join('\n');
}

async function copyBrief() {
  const text = buildBrief();
  try { await navigator.clipboard.writeText(text); toast('Coach brief copied — paste it to Claude'); }
  catch { window.prompt('Copy this:', text); }
}

// ---------- Cloud sync card ----------
function syncCard(rerender) {
  const d = getData();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, '☁️ Cloud sync'),
    el('span', { class: 'card__sub', id: 'syncStatus' }, '…')));

  sync.onStatus((s) => {
    const elx = card.querySelector('#syncStatus');
    if (!elx) return;
    const map = { off: 'not set up', ready: 'connected — sign in', 'signed-in': s.detail || 'signed in ✓', syncing: 'syncing…', error: '⚠ ' + s.detail };
    elx.textContent = map[s.state] || s.state;
  });

  if (!d.settings.supabase.url) {
    card.append(el('div', { class: 'card__sub', style: 'margin-bottom:10px' },
      'Free Supabase account → your phone, iPad and laptop share one brain. Claude walks you through it in milestone M4.'));
  }

  const url = el('input', { type: 'url', placeholder: 'Supabase project URL', value: d.settings.supabase.url || '' });
  const key = el('input', { type: 'text', placeholder: 'Supabase anon key', value: d.settings.supabase.key || '' });
  card.append(el('div', { class: 'stack' }, url, key,
    el('button', { class: 'btn btn--full', onClick: () => {
      update((x) => { x.settings.supabase.url = url.value.trim(); x.settings.supabase.key = key.value.trim(); });
      toast('Saved — sign in below'); sync.init(); rerender();
    } }, 'Save connection')));

  if (d.settings.supabase.url) {
    const email = el('input', { type: 'text', placeholder: 'email', autocomplete: 'username' });
    const pass = el('input', { type: 'text', placeholder: 'password', autocomplete: 'current-password', style: '-webkit-text-security:disc' });
    card.append(el('div', { class: 'stack', style: 'margin-top:12px' }, email, pass,
      el('div', { class: 'rowflex' },
        el('button', { class: 'btn btn--primary', style: 'flex:1', onClick: async () => {
          try { await sync.signIn(email.value.trim(), pass.value); toast('Signed in ✓'); await sync.syncNow(); }
          catch (err) { toast('Sign-in failed: ' + err.message); }
        } }, 'Sign in'),
        el('button', { class: 'btn', style: 'flex:1', onClick: async () => {
          try { await sync.signUp(email.value.trim(), pass.value); toast('Account created — now sign in'); }
          catch (err) { toast('Sign-up failed: ' + err.message); }
        } }, 'Create account')),
      el('button', { class: 'btn btn--ghost btn--full', onClick: async () => {
        const r = await sync.syncNow();
        toast(r.ok ? `Synced ✓ (pulled ${r.pulled}, pushed ${r.pushed})` : 'Sync: ' + r.reason);
      } }, '↻ Sync now')));
  }
  return card;
}

function render(view) {
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();

  view.append(el('div', { class: 'section-title' }, 'Settings'));

  // Coach brief — the "talk to Claude" bridge
  view.append(el('div', { class: 'card card--accent' },
    el('div', { class: 'card__title', style: 'margin-bottom:4px' }, '🧠 Coach brief'),
    el('div', { class: 'card__sub', style: 'margin-bottom:12px' }, 'One tap → a summary of your streaks, check-ins, debt and inbox, copied. Paste it into any Claude session for instant coaching with full context.'),
    el('button', { class: 'btn btn--primary btn--full', onClick: copyBrief }, '📋 Copy my coach brief')));

  // Name
  const name = el('input', { type: 'text', value: d.settings.name || '', maxlength: '40', placeholder: 'Your name' });
  view.append(el('div', { class: 'card' },
    el('div', { class: 'card__title', style: 'margin-bottom:10px' }, 'Your name'),
    el('div', { class: 'inline-form' }, name,
      el('button', { class: 'btn btn--primary', onClick: () => { update((x) => { x.settings.name = name.value.trim() || 'friend'; }); toast('Saved'); } }, 'Save'))));

  // Sync
  view.append(syncCard(rerender));

  // Data
  const fileInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none', onChange: (e) => { if (e.target.files[0]) importData(e.target.files[0], rerender); } });
  view.append(el('div', { class: 'card' },
    el('div', { class: 'card__title', style: 'margin-bottom:4px' }, 'Your data'),
    el('div', { class: 'card__sub', style: 'margin-bottom:12px' }, 'Lives on this device (and your Supabase once connected). Export = backup + how you hand data to Claude.'),
    el('div', { class: 'stack' },
      el('button', { class: 'btn btn--full', onClick: exportData }, '⬇ Export backup (.json)'),
      el('button', { class: 'btn btn--full', onClick: () => fileInput.click() }, '⬆ Import backup / seed file'),
      fileInput,
      el('button', { class: 'btn btn--danger btn--full', onClick: () => { if (confirmAction('Erase ALL data on this device? Export first!')) { resetAll(); toast('Wiped clean'); rerender(); } } }, 'Reset everything'))));

  // About
  view.append(el('div', { class: 'card' },
    el('div', { class: 'card__title', style: 'margin-bottom:4px' }, 'About'),
    el('div', { class: 'card__sub' }, 'Compound · v0.2 · small reps, compounded · built with Claude'),
    el('div', { class: 'card__sub', style: 'margin-top:6px' },
      `Habits ${d.habits.length} · Tasks ${d.tasks.length} · Check-ins ${Object.keys(d.checkins).length} · Goals ${d.goals.length} · Workouts ${d.gym.sessions.length} · Inbox ${d.inbox.length} · Books ${d.books.length}`)));
}

export default { render };
