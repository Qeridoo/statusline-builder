import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAnsi, renderHtml, buildLines, separatorFor } from '../src/render.js';
import { CATALOG_BY_ID, makeBlock } from '../src/catalog.js';

const payload = JSON.parse(readFileSync(new URL('../sample-payload.json', import.meta.url)));
const now = Date.now();
const strip = s => s.replace(/\[[0-9;]*m/g, '');
const pick = (...ids) => ids.map(id => ({ ...CATALOG_BY_ID[id] }));
const cfg = over => ({
  segments: pick('model', 'project_dir'),
  separator: ' | ',
  dimSeparator: true,
  lineCount: 1,
  ...over
});

test('segments are joined by the separator', () => {
  assert.match(strip(renderAnsi(cfg(), payload, now)), /Opus 5 \| .*Claude Code/);
});

test('empty segments are dropped, not printed blank', () => {
  const out = renderAnsi(cfg({ segments: pick('model', 'session_name') }), {}, now);
  assert.equal(strip(out).trim(), '');
});

test('segments split across lines', () => {
  const segments = pick('model', 'project_dir');
  segments[1].line = 1;
  const out = renderAnsi(cfg({ segments, lineCount: 2 }), payload, now);
  assert.equal(out.split('\n').length, 2);
});

test('a line with nothing on it is not emitted', () => {
  const segments = pick('model', 'session_name');
  segments[1].line = 1;
  const out = renderAnsi(cfg({ segments, lineCount: 2 }), { model: { display_name: 'Opus 5' } }, now);
  assert.equal(out.split('\n').length, 1);
});

test('labels are shown when asked for', () => {
  const segments = pick('ctx_used');
  segments[0].showLabel = true;
  assert.match(strip(renderAnsi(cfg({ segments }), payload, now)), /ctx: 10%/);
});

test('threshold colours change with the value', () => {
  const segments = pick('ctx_used');
  const cold = buildLines(cfg({ segments }), payload, now)[0].parts[0].hex;
  const hot = buildLines(
    cfg({ segments }),
    { ...payload, context_window: { ...payload.context_window, used_percentage: 95 } },
    now
  )[0].parts[0].hex;
  assert.notEqual(cold, hot);
  assert.equal(hot, '#e06c75');
});

test('renderHtml escapes markup from payload values', () => {
  const evil = { ...payload, session_name: '<img src=x>' };
  const html = renderHtml(cfg({ segments: pick('session_name') }), evil, now);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('renderHtml refuses a colour that is not a plain hex', () => {
  const segments = pick('model');
  segments[0].color = { mode: 'static', value: 'red;background:url(x)' };
  const html = renderHtml(cfg({ segments }), payload, now);
  assert.ok(!html.includes('background'));
});

test('each line uses its own separator', () => {
  const segments = pick('model', 'project_dir', 'ctx_used', 'limit_7d');
  segments[2].line = 1;
  segments[3].line = 1;
  const out = strip(renderAnsi(cfg({ segments, lineCount: 2, separators: [' ~ ', ' # '] }), payload, now));
  const [first, second] = out.split(String.fromCharCode(10));
  assert.ok(first.includes(' ~ '), first);
  assert.ok(!first.includes(' # '), first);
  assert.ok(second.includes(' # '), second);
  assert.ok(!second.includes(' ~ '), second);
});

test('separatorFor falls back to the shared separator', () => {
  assert.equal(separatorFor({ separator: ' @ ' }, 2), ' @ ');
  assert.equal(separatorFor({ separator: ' @ ', separators: [' ! '] }, 0), ' ! ');
  assert.equal(separatorFor({ separator: ' @ ', separators: [' ! '] }, 1), ' @ ');
  assert.equal(separatorFor({}, 0), ' | ');
});

test('a literal block renders even when everything else is missing', () => {
  const segments = [makeBlock('block_1', '┃'), ...pick('model')];
  assert.equal(strip(renderAnsi(cfg({ segments }), {}, now)), '┃');
});

test('a block sits between segments as a divider', () => {
  const segments = [...pick('model'), makeBlock('block_1', '//'), ...pick('project_dir')];
  assert.match(strip(renderAnsi(cfg({ segments }), payload, now)), /Opus 5 \| \/\/ \| .*Claude Code/);
});
