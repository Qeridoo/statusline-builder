// Metrics that are not present in the payload and have to be computed from the
// weekly rate-limit bucket. All of them return null when the bucket is absent.

import { parseResetsAt } from './format.js';

export const WINDOW_MS = 7 * 24 * 3600 * 1000;

export function weeklyWindow(payload, now) {
  const bucket = payload && payload.rate_limits && payload.rate_limits.seven_day;
  if (!bucket) return null;
  const resetsAt = parseResetsAt(bucket.resets_at);
  const used = Number(bucket.used_percentage);
  if (resetsAt === null || !Number.isFinite(used)) return null;
  const start = resetsAt - WINDOW_MS;
  const elapsedFraction = Math.min(1, Math.max(0, (now - start) / WINDOW_MS));
  // Floor at one hour so pace never divides by zero right before the reset.
  const daysLeft = Math.max((resetsAt - now) / 86400000, 1 / 24);
  return { used, resetsAt, elapsedFraction, daysLeft };
}

// Signed percentage points away from a perfectly even burn.
// Negative means under the line, positive means ahead of it.
export function evenBurn(payload, now) {
  const w = weeklyWindow(payload, now);
  return w ? w.used - w.elapsedFraction * 100 : null;
}

// Percent of the weekly allowance that can be spent per day from now on.
export function pace(payload, now) {
  const w = weeklyWindow(payload, now);
  return w ? (100 - w.used) / w.daysLeft : null;
}

// Percent of today's slice still available. Capped at a full slice, but allowed
// to go negative: below zero means today is eating into tomorrow.
//
// This is stateless and therefore an approximation. It assumes usage before
// today tracked the even-burn line, because the payload carries no history.
export function todayLeft(payload, now) {
  const w = weeklyWindow(payload, now);
  if (!w) return null;
  const slice = 100 / 7;
  const dayIndex = Math.floor(w.elapsedFraction * 7);
  const usedToday = w.used - dayIndex * slice;
  return Math.min(100, ((slice - usedToday) / slice) * 100);
}

// The worst of the three meters, so a single emoji can stand in for all of them.
export function worstMeter(payload) {
  const candidates = [
    payload && payload.context_window && payload.context_window.used_percentage,
    payload && payload.rate_limits && payload.rate_limits.five_hour && payload.rate_limits.five_hour.used_percentage,
    payload && payload.rate_limits && payload.rate_limits.seven_day && payload.rate_limits.seven_day.used_percentage
  ].map(Number).filter(Number.isFinite);
  return candidates.length ? Math.max(...candidates) : null;
}

export function mood(payload) {
  return worstMeter(payload);
}
