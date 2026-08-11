import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBundle, buildHtml, stripModuleSyntax } from '../build.js';

test('multi-line imports are stripped', () => {
  const source = 'import {\n  a, b\n} from "./x.js";\nconst c = 1;\n';
  assert.equal(stripModuleSyntax(source).trim(), 'const c = 1;');
});

test('the export keyword is stripped but the declaration survives', () => {
  assert.equal(stripModuleSyntax('export const A = 1;').trim(), 'const A = 1;');
  assert.equal(stripModuleSyntax('export function f() {}').trim(), 'function f() {}');
});

test('the bundle has no import or export statements left', () => {
  const bundle = buildBundle();
  assert.equal(/^\s*import\s/m.test(bundle), false);
  assert.equal(/^\s*export\s/m.test(bundle), false);
});

test('the bundle is syntactically valid as a module', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sl-build-')), 'bundle.mjs');
  writeFileSync(file, buildBundle());
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', file], { encoding: 'utf8' }));
});

test('the bundle declares no identifier twice at top level', () => {
  // The generated runtime is a template literal whose body repeats many of the
  // same helper names on purpose, so it is excluded from the scan.
  const bundle = buildBundle().replace(/String\.raw`[\s\S]*?\n`;/, 'RUNTIME');
  assert.ok(!bundle.includes('String.raw`'), 'runtime literal was not excluded');
  const seen = new Map();
  const duplicates = [];
  const declaration = /^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let match;
  while ((match = declaration.exec(bundle)) !== null) {
    const name = match[1];
    if (seen.has(name)) duplicates.push(name);
    seen.set(name, true);
  }
  assert.deepEqual(duplicates, []);
});

test('the page references nothing external', () => {
  const html = buildHtml();
  assert.equal(/(?:src|href)\s*=\s*["']https?:/i.test(html), false);
  assert.equal(/@import\s+url\(/i.test(html), false);
  assert.equal(/fonts\.googleapis|cdn\./i.test(html), false);
});

test('the page carries the sample payload and a title', () => {
  const html = buildHtml();
  assert.match(html, /<title>Claude Code Statusline Builder<\/title>/);
  assert.match(html, /const SAMPLE_PAYLOAD = \{/);
  assert.equal(html.includes('/*BUNDLE*/'), false);
  assert.equal(html.includes('/*CSS*/'), false);
});
