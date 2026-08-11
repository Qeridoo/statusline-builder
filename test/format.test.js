import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtPercent, fmtNumber, fmtDuration, fmtCountdown,
  fmtCurrency, fmtPath, fmtText, parseResetsAt
} from '../src/format.js';

test('fmtNumber abbreviates', () => {
  assert.equal(fmtNumber(950), '950');
  assert.equal(fmtNumber(95000), '95k');
  assert.equal(fmtNumber(1200000), '1.2M');
  assert.equal(fmtNumber(1500), '1.5k');
});

test('fmtDuration drops zero hours', () => {
  assert.equal(fmtDuration(17640000), '4h54m');
  assert.equal(fmtDuration(3240000), '54m');
  assert.equal(fmtDuration(0), '0m');
});

test('fmtDuration rolls over into days', () => {
  assert.equal(fmtDuration(93600000), '1d2h');
});

test('parseResetsAt handles seconds, millis and ISO', () => {
  assert.equal(parseResetsAt(1786800000), 1786800000000);
  assert.equal(parseResetsAt(1786800000000), 1786800000000);
  assert.equal(parseResetsAt('2026-08-11T10:00:00Z'), Date.parse('2026-08-11T10:00:00Z'));
  assert.equal(parseResetsAt(null), null);
  assert.equal(parseResetsAt('nonsense'), null);
});

test('fmtCountdown takes milliseconds and returns now when elapsed', () => {
  assert.equal(fmtCountdown(1000, 2000), 'now');
  assert.equal(fmtCountdown(2000 + 17640000, 2000), '4h54m');
});

test('fmtPath handles windows separators', () => {
  const p = 'C:/Users/dev/projects/Claude Code/statusline';
  assert.equal(fmtPath(p, { mode: 'basename' }), 'statusline');
  assert.equal(fmtPath(p, { mode: 'last2' }), 'Claude Code/statusline');
  assert.equal(fmtPath(p, { mode: 'full' }), p);
  assert.equal(fmtPath('C:\\Users\\dev\\proj', { mode: 'basename' }), 'proj');
  assert.equal(fmtPath(p, { mode: 'tilde' }), '~/projects/Claude Code/statusline');
});

test('fmtPercent respects decimals and sign', () => {
  assert.equal(fmtPercent(10.4), '10%');
  assert.equal(fmtPercent(10.44, { decimals: 1 }), '10.4%');
  assert.equal(fmtPercent(-11, { sign: true }), '-11%');
  assert.equal(fmtPercent(11, { sign: true }), '+11%');
});

test('fmtCurrency rounds to cents', () => {
  assert.equal(fmtCurrency(1.2345), '$1.23');
});

test('fmtText truncates', () => {
  assert.equal(fmtText('abcdefgh', { max: 5 }), 'abcd…');
  assert.equal(fmtText('abc', { max: 5 }), 'abc');
});
