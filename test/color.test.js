import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColor, hexToAnsi, ansiWrap } from '../src/color.js';

const stops = [[0, '#7ec699'], [50, '#e0c46c'], [90, '#e06c75']];

test('threshold picks the highest stop at or below the value', () => {
  assert.equal(resolveColor({ mode: 'threshold', stops }, 10), '#7ec699');
  assert.equal(resolveColor({ mode: 'threshold', stops }, 50), '#e0c46c');
  assert.equal(resolveColor({ mode: 'threshold', stops }, 95), '#e06c75');
});

test('threshold falls back to the lowest stop below the range', () => {
  assert.equal(resolveColor({ mode: 'threshold', stops }, -5), '#7ec699');
});

test('static returns its value regardless of the number', () => {
  assert.equal(resolveColor({ mode: 'static', value: '#abcdef' }, 99), '#abcdef');
});

test('gradient interpolates', () => {
  const spec = { mode: 'gradient', from: '#000000', to: '#ffffff', min: 0, max: 100 };
  assert.equal(resolveColor(spec, 0), '#000000');
  assert.equal(resolveColor(spec, 100), '#ffffff');
  assert.equal(resolveColor(spec, 50), '#808080');
});

test('unknown mode resolves to null', () => {
  assert.equal(resolveColor({ mode: 'nope' }, 1), null);
  assert.equal(resolveColor(null, 1), null);
});

test('hexToAnsi emits truecolor', () => {
  assert.equal(hexToAnsi('#e06c75'), '38;2;224;108;117');
});

test('ansiWrap resets afterwards', () => {
  assert.equal(ansiWrap('x', '#000000'), '[38;2;0;0;0mx[0m');
});

test('ansiWrap without a colour still honours dim', () => {
  assert.equal(ansiWrap('x', null, { dim: true }), '[2mx[0m');
  assert.equal(ansiWrap('x', null), 'x');
});
