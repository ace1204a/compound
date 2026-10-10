// ============================================================
// Nutrition targets over time.
//
// diet.targets is a list of { from:'YYYY-MM-DD', mode, kcal, protein, note? }.
// A day is judged against the newest entry that started on or before it, so
// changing the target (cut -> bulk, or +150 kcal) never rewrites old days.
// No entries at all = the original August cut numbers.
//
// Pure functions, no DOM and no app imports: the Diet tab and the coach brief
// both use these so they can never disagree about what "on target" means.
// ============================================================

export const ORIGINAL_TARGET = { from: '', mode: 'cut', kcal: 2200, protein: 180 };

export const MODES = {
  cut:      { label: 'Cut',      weekly: 'losing 0.3–0.7 kg/wk' },
  bulk:     { label: 'Bulk',     weekly: 'gaining 0.15–0.30 kg/wk' },
  maintain: { label: 'Maintain', weekly: 'holding weight' },
};

const DAY = 86400000;
const toMs = (key) => Date.parse(key + 'T00:00:00Z');
export const shiftKey = (key, n) => new Date(toMs(key) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);

export function targetFor(d, key) {
  const list = ((d.diet || {}).targets || [])
    .filter((t) => t && t.from && t.from <= key)
    .sort((a, b) => a.from.localeCompare(b.from));
  return list.length ? list[list.length - 1] : ORIGINAL_TARGET;
}

/** Is a day's calorie total "on target" for this mode? Used for the habit auto-tick. */
export function kcalOk(t, kcal) {
  if (typeof kcal !== 'number') return false;
  // Eating a bit under a bulk target is the miss; a modest overshoot is not.
  if (t.mode === 'bulk') return kcal >= t.kcal - 150 && kcal <= t.kcal + 300;
  return Math.abs(kcal - t.kcal) <= 150;
}
export const proteinOk = (t, g) => typeof g === 'number' && g >= t.protein;

export function kcalText(t) { return t.kcal.toLocaleString('en-GB'); }

/** Add or replace the target that starts on `from` (never touches other entries). */
export function upsertTarget(list, entry) {
  const out = (list || []).filter((t) => t.from !== entry.from);
  out.push(entry);
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

// ---------- weight trend (7-day averages, never single days) ----------
function avgBetween(weights, fromKey, toKey) {
  const xs = (weights || []).filter((w) => w.date >= fromKey && w.date <= toKey).map((w) => +w.kg).filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** rate = this week's average minus last week's (+ = gaining). prevRate is the same one week earlier. */
export function weekTrend(weights, today) {
  const thisWk = avgBetween(weights, shiftKey(today, -6), today);
  const lastWk = avgBetween(weights, shiftKey(today, -13), shiftKey(today, -7));
  const prevWk = avgBetween(weights, shiftKey(today, -20), shiftKey(today, -14));
  return {
    thisWk, lastWk, prevWk,
    rate: thisWk != null && lastWk != null ? thisWk - lastWk : null,
    prevRate: lastWk != null && prevWk != null ? lastWk - prevWk : null,
  };
}

/** Which band a weekly change falls in for this mode. */
export function band(mode, rate) {
  if (rate == null) return null;
  if (mode === 'bulk') {
    if (rate > 0.45) return 'fast';
    if (rate > 0.30) return 'quick';
    if (rate >= 0.15) return 'ok';
    if (rate >= 0.05) return 'slow';
    return 'stall';
  }
  if (mode === 'cut') {
    const loss = -rate;
    if (loss > 0.8) return 'fast';
    if (loss >= 0.25) return 'ok';
    if (loss >= 0.1) return 'slow';
    return 'stall';
  }
  return Math.abs(rate) <= 0.2 ? 'ok' : (rate > 0 ? 'fast' : 'stall');
}

export function targetRange(mode) {
  return mode === 'bulk' ? '+0.15–0.30' : mode === 'cut' ? '−0.3–0.7' : '±0.2';
}

/**
 * Read the trend and say what to do. A kcal change is only OFFERED once the same
 * problem has shown two weeks running, and never inside the first two weeks of a
 * new target (water and glycogen swing the scale then). The app proposes; the
 * person decides.
 */
export function trendVerdict(t, today, w) {
  const daysIn = t.from ? daysBetween(t.from, today) : 999;
  if (daysIn < 14) {
    return { verdict: `Early weeks of the ${t.mode}: water and glycogen swing the scale. No target changes before ${shiftKey(t.from, 14)}.`, cls: '', delta: 0 };
  }
  const b = band(t.mode, w.rate), prev = band(t.mode, w.prevRate);
  const repeat = b === prev;
  const sure = (msg, delta) => (repeat
    ? { verdict: `${msg} Second week running.`, cls: 'chip--streak', delta }
    : { verdict: `${msg} If next week looks the same, change the target.`, cls: 'chip--streak', delta: 0 });

  if (t.mode === 'bulk') {
    if (b === 'ok') return { verdict: 'On target. Change nothing, this is exactly the rate you want.', cls: 'chip--key', delta: 0 };
    if (b === 'quick') return { verdict: 'A touch fast. Hold and reassess next week.', cls: '', delta: 0 };
    if (b === 'slow') return { verdict: 'A touch slow. Hold and reassess next week.', cls: '', delta: 0 };
    if (b === 'fast') return sure('Gaining too fast, mostly fat at this speed.', -150);
    return sure('No gain.', 150);
  }
  if (t.mode === 'cut') {
    if (b === 'ok') return { verdict: 'On target. Change nothing, this is exactly the rate you want.', cls: 'chip--key', delta: 0 };
    if (b === 'slow') return { verdict: 'Slightly under target rate. Hold and reassess next week.', cls: '', delta: 0 };
    if (b === 'fast') return sure('Losing fast.', 150);
    return sure('Stalling.', -100);
  }
  if (b === 'ok') return { verdict: 'Holding steady.', cls: 'chip--key', delta: 0 };
  return { verdict: 'Weight is drifting. Look at the intake days before touching the target.', cls: '', delta: 0 };
}
