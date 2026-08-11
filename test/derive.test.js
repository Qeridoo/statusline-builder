import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyWindow, evenBurn, pace, todayLeft, mood, WINDOW_MS } from '../src/derive.js';

const at = (usedPct, elapsedFraction) => {
  const now = 1786000000000;
  const resetsAt = now + WINDOW_MS * (1 - elapsedFraction);
  return [{ rate_limits: { seven_day: { used_percentage: usedPct, resets_at: resetsAt } } }, now];
};

test('weeklyWindow reports the elapsed fraction and days left', () => {
  const [p, now] = at(32, 0.5);
  const w = weeklyWindow(p, now);
  assert.ok(Math.abs(w.elapsedFraction - 0.5) < 1e-9);
  assert.ok(Math.abs(w.daysLeft - 3.5) < 1e-9);
});

test('evenBurn is negative when under the line', () => {
  const [p, now] = at(32, 0.43);
  assert.equal(Math.round(evenBurn(p, now)), -11);
});

test('evenBurn is zero on the line', () => {
  const [p, now] = at(50, 0.5);
  assert.equal(Math.round(evenBurn(p, now)), 0);
});

test('pace spreads what is left over the days that remain', () => {
  const [p, now] = at(30, 0.5);
  assert.equal(Math.round(pace(p, now)), 20);
});

test('todayLeft goes negative when today ate tomorrow', () => {
  const [p, now] = at(60, 2 / 7);
  assert.ok(todayLeft(p, now) < 0);
});

test('todayLeft caps at a full slice', () => {
  const [p, now] = at(0, 0.5);
  assert.equal(todayLeft(p, now), 100);
});

test('mood takes the worst meter', () => {
  const now = 1786000000000;
  const p = {
    context_window: { used_percentage: 80 },
    rate_limits: {
      five_hour: { used_percentage: 10, resets_at: now + 1000 },
      seven_day: { used_percentage: 20, resets_at: now + WINDOW_MS / 2 }
    }
  };
  assert.equal(mood(p, now), 80);
});

test('metrics return null without rate limits', () => {
  assert.equal(evenBurn({}, 1786000000000), null);
  assert.equal(pace({}, 1786000000000), null);
  assert.equal(todayLeft({}, 1786000000000), null);
  assert.equal(weeklyWindow({}, 1786000000000), null);
  assert.equal(mood({}, 1786000000000), null);
});
