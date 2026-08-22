// ============================================================
// Coach — the in-app AI coach. A conversation, not a form.
//
// Deliberately NOT a habit tracker, promise list or reflection
// journal: the app already has Habits, Today and Journal, and
// duplicating them would just split the data in two.
//
// Everything sensitive stays off the wire: the API key lives in
// the Supabase edge function, and who-you-are lives in
// coach.profile, which is private synced data — never in git.
// ============================================================

import { getData, update, uid } from '../store.js';
import { el, toast, confirmAction, restoreScroll } from '../ui.js';
import { buildBrief } from './settings.js';
import * as sync from '../sync.js';

let sending = false;
let pendingText = '';   // survives the re-render while a reply is in flight
let lastUsage = null;

const OPENERS = [
  ['📋', 'Where am I at?', 'Look at my data and tell me straight where I actually am right now. What is the one thing that matters most today?'],
  ['🥊', 'Call me out', 'Look at my last few days and call out the thing I am avoiding. Do not be nice about it.'],
  ['🏋️', 'Talk me into it', 'I do not want to train today. Talk me into it — or tell me honestly if today is the day to downgrade instead of skip.'],
  ['📉', 'I want to trade', 'I am thinking about opening a trade right now. Check me against my own rules before I do anything.'],
  ['🌙', 'Close the day', 'Walk me through closing today out properly. What did I actually get done, and what is tomorrow about?'],
];

function messageEl(m) {
  const wrap = el('div', { class: 'chat__msg chat__msg--' + m.role });
  // The coach writes in plain text; render paragraphs so long replies stay readable.
  String(m.text).split(/\n{2,}/).forEach((para) => {
    const p = el('div', { class: 'chat__para' });
    para.split('\n').forEach((line, i) => { if (i) p.append(el('br')); p.append(document.createTextNode(line)); });
    wrap.append(p);
  });
  return wrap;
}

function setupNeeded() {
  const d = getData();
  if (!d.settings.supabase || !d.settings.supabase.url) return 'Connect cloud sync in Settings first — the coach runs through your own Supabase account.';
  if (sync.getStatus && sync.getStatus() === 'signed-out') return null; // sync.js will give the precise error on send
  return null;
}

function render(view) {
  const y = window.scrollY;
  const rerender = () => render(view);
  view.replaceChildren();
  const d = getData();
  const msgs = d.coach.messages || [];

  // ---------- header ----------
  const modelSeg = el('div', { class: 'seg seg--sm' },
    el('button', { class: d.coach.model !== 'deep' ? 'on' : '', title: 'Sonnet 5 — about 2p a message',
      onClick: () => { update((x) => { x.coach.model = 'standard'; }); rerender(); } }, 'Standard'),
    el('button', { class: d.coach.model === 'deep' ? 'on' : '', title: 'Opus 5 — about 5p a message. Worth it for hard conversations.',
      onClick: () => { update((x) => { x.coach.model = 'deep'; }); rerender(); } }, 'Deep'));

  view.append(el('div', { class: 'rowflex' },
    el('div', { class: 'section-title', style: 'flex:1' }, 'Coach'),
    modelSeg,
    msgs.length ? el('button', { class: 'btn btn--icon', title: 'Clear conversation',
      onClick: () => { if (confirmAction('Clear the whole conversation?')) { update((x) => { x.coach.messages = []; }); rerender(); } } }, '🗑') : null));

  if (lastUsage) {
    view.append(el('div', { class: 'hint', style: 'margin:-2px 2px 8px' },
      `${lastUsage.callsToday}/${lastUsage.capCalls} messages today · £${(lastUsage.usdMonth * 0.79).toFixed(2)} this month (cap £${(lastUsage.capUsdMonth * 0.79).toFixed(2)})`));
  }

  const warn = setupNeeded();
  if (warn) view.append(el('div', { class: 'card card--warn' }, warn));
  if (!d.coach.profile) {
    view.append(el('div', { class: 'card card--warn' },
      'The coach has no profile yet, so it only knows your app data — not your history. Import your coach profile in Settings to fix that.'));
  }

  // ---------- thread ----------
  const thread = el('div', { class: 'chat' });
  if (!msgs.length) {
    thread.append(el('div', { class: 'empty' },
      el('span', { class: 'empty__emoji' }, '🧠'),
      el('div', {}, 'Your coach can see your habits, schedule, training, cut, trading rules, money and journal.'),
      el('div', { class: 'hint', style: 'margin-top:6px' }, 'Ask it anything, or start with one of these:')));
  } else {
    msgs.forEach((m) => thread.append(messageEl(m)));
  }
  if (sending) thread.append(el('div', { class: 'chat__msg chat__msg--assistant chat__msg--wait' }, 'Thinking…'));
  view.append(thread);

  // ---------- composer ----------
  const input = el('textarea', { class: 'chat__input', placeholder: 'Talk to your coach…', rows: '3' });
  input.value = pendingText;
  input.addEventListener('input', () => { pendingText = input.value; });

  const send = async (text) => {
    const message = (text || input.value).trim();
    if (!message || sending) return;
    sending = true; pendingText = '';

    // Show his message immediately — a coach you have to wait to see yourself in is annoying.
    update((x) => {
      x.coach.messages = x.coach.messages || [];
      x.coach.messages.push({ id: uid(), role: 'user', text: message, at: new Date().toISOString() });
    });
    rerender();

    try {
      const res = await sync.invokeFunction('coach', {
        message,
        model: getData().coach.model || 'standard',
        profile: getData().coach.profile || '',
        context: buildBrief(),
        history: (getData().coach.messages || []).slice(0, -1).slice(-12).map((m) => ({ role: m.role, text: m.text })),
      });
      if (!res || typeof res.reply !== 'string') throw new Error('The coach sent back nothing usable.');
      lastUsage = res.usage || null;
      update((x) => {
        x.coach.messages.push({ id: uid(), role: 'assistant', text: res.reply, at: new Date().toISOString() });
        x.coach.messages = x.coach.messages.slice(-60);
      });
    } catch (err) {
      toast(err.message || 'Coach failed');
      // Put his message back in the box rather than losing what he typed.
      update((x) => { x.coach.messages = (x.coach.messages || []).filter((m) => m.text !== message || m.role !== 'user'); });
      pendingText = message;
    } finally {
      sending = false; rerender();
    }
  };

  // Enter sends on desktop; on a phone the keyboard's return key should make a newline.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
  });

  view.append(el('div', { class: 'card' }, input,
    el('button', { class: 'btn btn--primary btn--full', style: 'margin-top:8px', disabled: sending, onClick: () => send() },
      sending ? 'Thinking…' : 'Send')));

  if (!sending) {
    const chips = el('div', { class: 'chipwrap' });
    OPENERS.forEach(([icon, label, prompt]) => chips.append(
      el('button', { class: 'btn btn--sm btn--ghost', onClick: () => send(prompt) }, `${icon} ${label}`)));
    view.append(chips);
  }

  // Keep the newest message in view without yanking the whole page around.
  // Same belt-and-braces as restoreScroll: the thread's height isn't final
  // until layout settles, so one rAF isn't enough.
  const stick = () => { thread.scrollTop = thread.scrollHeight; };
  stick();
  requestAnimationFrame(() => { stick(); requestAnimationFrame(stick); });
  setTimeout(stick, 60);
  restoreScroll(y);
}

export default { render };
