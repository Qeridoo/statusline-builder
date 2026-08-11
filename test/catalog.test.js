import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG, CATALOG_BY_ID, GROUPS, REFERENCE_ORDER, getValue, applyFormat } from '../src/catalog.js';

const payload = JSON.parse(readFileSync(new URL('../sample-payload.json', import.meta.url)));
const now = Date.now();

test('every segment has a unique id and a known group', () => {
  const ids = CATALOG.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(GROUPS.map(g => g.id));
  for (const s of CATALOG) assert.ok(groups.has(s.group), s.id + ' has unknown group ' + s.group);
});

test('project folder segment resolves from the sample payload', () => {
  assert.equal(getValue(CATALOG_BY_ID.project_dir, payload, now).display, 'Claude Code');
});

test('session name segment resolves', () => {
  assert.equal(getValue(CATALOG_BY_ID.session_name, payload, now).display, 'statusline-builder');
});

test('both rate limit buckets exist and no five-day bucket does', () => {
  assert.ok(CATALOG_BY_ID.limit_5h);
  assert.ok(CATALOG_BY_ID.limit_7d);
  assert.equal(CATALOG_BY_ID.limit_5d, undefined);
});

test('percent segments round', () => {
  assert.equal(getValue(CATALOG_BY_ID.ctx_used, payload, now).display, '10%');
  assert.equal(getValue(CATALOG_BY_ID.limit_7d, payload, now).display, '32%');
});

test('lines delta composes both counters', () => {
  assert.equal(getValue(CATALOG_BY_ID.lines_delta, payload, now).display, '+503/-16');
});

test('hideValues drops uninteresting defaults', () => {
  assert.equal(getValue(CATALOG_BY_ID.output_style, payload, now), null);
  assert.equal(getValue(CATALOG_BY_ID.permission_mode, payload, now), null);
});

test('false booleans are dropped', () => {
  assert.equal(getValue(CATALOG_BY_ID.fast_mode, payload, now), null);
  assert.equal(getValue(CATALOG_BY_ID.thinking, payload, now).display, 'think');
});

test('string segments get a colour value from their scale map', () => {
  assert.equal(getValue(CATALOG_BY_ID.effort, payload, now).colorValue, 60);
});

test('no segment throws on an empty payload', () => {
  for (const s of CATALOG) assert.doesNotThrow(() => getValue(s, {}, now), s.id);
  for (const s of CATALOG) assert.doesNotThrow(() => getValue(s, null, now), s.id);
});

test('every reference-order id exists in the catalogue', () => {
  for (const id of REFERENCE_ORDER) assert.ok(CATALOG_BY_ID[id], id + ' missing');
});

test('arrow format shows direction', () => {
  assert.equal(applyFormat(-11, { type: 'arrow' }, now), '▼11');
  assert.equal(applyFormat(4, { type: 'arrow' }, now), '▲4');
});

test('emoji scale picks the worst reached stop', () => {
  const f = { type: 'emojiScale' };
  assert.equal(applyFormat(10, f, now), '😺');
  assert.equal(applyFormat(55, f, now), '🙀');
  assert.equal(applyFormat(95, f, now), '😾');
});
