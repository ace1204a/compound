// ============================================================
// ui.js — tiny helpers shared by every module.
// No framework: just small functions to build DOM and dates.
// ============================================================

/** Create an element. props: {class, html, onClick, ...attrs}. children: nodes/strings. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/** Transient bottom toast message. Optional action: { label, onClick }. */
let toastTimer;
export function toast(msg, action) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (action) {
    t.append(el('button', { class: 'toast__btn', onClick: action.onClick }, action.label));
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 8000 : 2200);
}

/** Parse 'HH:MM' to minutes since midnight (null if invalid). */
export function timeToMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null;
}

// ---------- Dates (all local, no timezone surprises) ----------

/** 'YYYY-MM-DD' for a date (default: today, local time). */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function keyToDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Shift a date key by n days (n can be negative). */
export function addDays(k, n) {
  const d = keyToDate(k);
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

/** e.g. "Monday, 14 July". */
export function prettyDate(d = new Date()) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Monday-based key for the week containing date k (for weekly habits). */
export function weekStartKey(k = todayKey()) {
  const d = keyToDate(k);
  const dow = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - dow);
  return todayKey(d);
}

/** Confirm helper (kept simple with native confirm for now). */
export function confirmAction(msg) { return window.confirm(msg); }
