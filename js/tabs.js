// ============================================================
// tabs.js — the tab registry (metadata only, no render fns) so
// both app.js and settings.js can share it without a circular
// dependency. The bottom bar's order + visibility live in
// settings.tabOrder / settings.tabHidden.
// ============================================================

export const TABS = [
  { id: 'today',    label: 'Today',    icon: '◎' },
  { id: 'coach',    label: 'Coach',    icon: '☯' },
  { id: 'plan',     label: 'Plan',     icon: '▤' },
  { id: 'habits',   label: 'Habits',   icon: '✓' },
  { id: 'tasks',    label: 'Tasks',    icon: '☰' },
  { id: 'goals',    label: 'Goals',    icon: '◆' },
  { id: 'gym',      label: 'Gym',      icon: '⟰' },
  { id: 'diet',     label: 'Diet',     icon: '◍' },
  { id: 'trading',  label: 'Trading',  icon: '⇅' },
  { id: 'inbox',    label: 'Inbox',    icon: '⬇' },
  { id: 'finance',  label: 'Money',    icon: '£' },
  { id: 'books',    label: 'Books',    icon: '❒' },
  { id: 'journal',  label: 'Journal',  icon: '✎' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

// Today and Settings can never be hidden (you always need home + the place to un-hide).
export const LOCKED = ['today', 'settings'];

/** Full list of tab ids in the user's chosen order (unknown/new ids appended). */
export function orderedIds(settings) {
  const ids = TABS.map((t) => t.id);
  const ord = ((settings && settings.tabOrder) || []).filter((x) => ids.includes(x));
  return [...ord, ...ids.filter((x) => !ord.includes(x))];
}

/** Tab ids that should actually appear in the bottom bar. */
export function visibleIds(settings) {
  const hidden = new Set(((settings && settings.tabHidden) || []).filter((id) => !LOCKED.includes(id)));
  return orderedIds(settings).filter((id) => !hidden.has(id));
}
