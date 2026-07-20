// ============================================================
// app.js — boots the app, draws the tab bar, and renders the
// active module into <main id="view">. Navigation uses the URL
// hash (e.g. #/habits) so back/forward and refresh just work.
// ============================================================

import { getData, subscribe } from './store.js';
import { el, clear, prettyDate, todayKey, toast } from './ui.js';
import * as sync from './sync.js';

import today from './modules/today.js';
import plan from './modules/plan.js';
import habits from './modules/habits.js';
import tasks from './modules/tasks.js';
import goals from './modules/goals.js';
import gym from './modules/gym.js';
import diet from './modules/diet.js';
import trading from './modules/trading.js';
import inbox from './modules/inbox.js';
import finance from './modules/finance.js';
import books from './modules/books.js';
import settings from './modules/settings.js';

// The order here is the order of the bottom tab bar.
const MODULES = [
  { id: 'today',    label: 'Today',   icon: '◎', mod: today },
  { id: 'plan',     label: 'Plan',    icon: '▤', mod: plan },
  { id: 'habits',   label: 'Habits',  icon: '✓', mod: habits },
  { id: 'tasks',    label: 'Tasks',   icon: '☰', mod: tasks },
  { id: 'goals',    label: 'Goals',   icon: '◆', mod: goals },
  { id: 'gym',      label: 'Gym',     icon: '⟰', mod: gym },
  { id: 'diet',     label: 'Diet',    icon: '◍', mod: diet },
  { id: 'trading',  label: 'Trading', icon: '⇅', mod: trading },
  { id: 'inbox',    label: 'Inbox',   icon: '⬇', mod: inbox },
  { id: 'finance',  label: 'Money',   icon: '£',  mod: finance },
  { id: 'books',    label: 'Books',   icon: '❒', mod: books },
  { id: 'settings', label: 'Settings',icon: '⚙', mod: settings },
];

const viewEl = document.getElementById('view');
const tabsEl = document.getElementById('tabs');

function currentId() {
  const id = (location.hash || '').replace(/^#\/?/, '');
  return MODULES.some((m) => m.id === id) ? id : 'today';
}

function renderTabs(activeId) {
  clear(tabsEl);
  for (const m of MODULES) {
    tabsEl.append(
      el('button', {
        class: 'tab' + (m.id === activeId ? ' on' : ''),
        onClick: () => { location.hash = '/' + m.id; },
      },
        el('span', { class: 'tab__i' }, m.icon),
        m.label,
      )
    );
  }
  // keep the active tab visible in the scroll strip
  const on = tabsEl.querySelector('.tab.on');
  if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function renderView() {
  const id = currentId();
  const entry = MODULES.find((m) => m.id === id);
  renderTabs(id);
  clear(viewEl);
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    entry.mod.render(viewEl);
  } catch (err) {
    console.error(`Module "${id}" failed to render:`, err);
    viewEl.append(el('div', { class: 'banner banner--warn' },
      `Something went wrong showing "${entry.label}". The rest of the app is fine — tell Claude what you were doing.`));
  }
}

// ---- header (date + non-negotiables progress ring) ----
function renderHeader() {
  document.getElementById('appDate').textContent = prettyDate();
  const d = getData();
  const keystones = d.habits.filter((h) => h.keystone);
  const done = keystones.filter((h) => h.log && h.log[todayKey()]).length;
  const pct = keystones.length ? (done / keystones.length) * 100 : 0;
  const complete = keystones.length > 0 && done === keystones.length;
  const ring = document.getElementById('appScore');
  const color = complete ? 'var(--green)' : 'var(--gold)';
  ring.style.background = `conic-gradient(${color} ${pct}%, var(--card-2) 0)`;
  ring.classList.toggle('done', complete);
  document.getElementById('scoreNum').textContent = `${done}/${keystones.length}`;
}

function refresh() { renderHeader(); renderView(); }

window.addEventListener('hashchange', refresh);
subscribe(() => { renderHeader(); });  // header updates live on any data change
document.getElementById('appTitle').textContent = getData().settings.appName || 'Compound';

refresh();

// cloud sync (dormant until configured in Settings)
sync.init().catch((err) => console.warn('Sync init skipped:', err.message));

// header sync dot: grey = off · gold pulse = syncing · green = synced · red = problem
sync.onStatus((s) => {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.className = 'syncdot ' + ({ off: '', ready: 'syncdot--warn', 'signed-in': 'syncdot--ok', syncing: 'syncdot--syncing', error: 'syncdot--err' }[s.state] || '');
  dot.title = 'Cloud sync: ' + (s.detail || s.state);
});

// offline + installability, with a visible "update ready" prompt so a new
// version never silently hides behind the cache again
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed:', err));
  });
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Compound has been updated', { label: 'Reload', onClick: () => location.reload() });
  });
}
