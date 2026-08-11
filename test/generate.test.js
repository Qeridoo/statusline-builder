import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateScript, generatePrompt, generateConfigJson, parseConfigJson,
  parseAnyConfig, extractCfgLiteral, generateSettingsSnippet
} from '../src/generate.js';
import { CATALOG, CATALOG_BY_ID, REFERENCE_ORDER, makeBlock } from '../src/catalog.js';
import { renderAnsi } from '../src/render.js';

const payloadText = readFileSync(new URL('../sample-payload.json', import.meta.url), 'utf8');
const payload = JSON.parse(payloadText);
const FROZEN_NOW = 1786442400000;

const configOf = ids => ({
  segments: ids.map(id => ({ ...CATALOG_BY_ID[id] })),
  separator: ' | ',
  dimSeparator: true,
  lineCount: 1
});

const run = (script, input, env = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-'));
  const file = join(dir, 'statusline.js');
  writeFileSync(file, script);
  return execFileSync(process.execPath, [file], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
};

test('the generated script renders the sample payload', () => {
  const cfg = configOf(['model', 'project_dir', 'ctx_used', 'limit_7d']);
  const out = run(generateScript(cfg), payloadText).replace(/\[[0-9;]*m/g, '');
  assert.match(out, /Opus 5/);
  assert.match(out, /Claude Code/);
  assert.match(out, /10%/);
  assert.match(out, /32%/);
});

test('the generated script matches the preview renderer byte for byte', () => {
  const cfg = configOf(REFERENCE_ORDER);
  const fromScript = run(generateScript(cfg), payloadText, { SL_NOW: String(FROZEN_NOW) });
  const fromRenderer = renderAnsi(cfg, payload, FROZEN_NOW) + '\n';
  assert.equal(fromScript, fromRenderer);
});

test('parity holds for every segment in the catalogue', () => {
  const cfg = { ...configOf(CATALOG.map(s => s.id)), lineCount: 2 };
  cfg.segments.forEach((s, i) => { s.line = i % 2; });
  const fromScript = run(generateScript(cfg), payloadText, { SL_NOW: String(FROZEN_NOW) });
  const fromRenderer = renderAnsi(cfg, payload, FROZEN_NOW) + '\n';
  assert.equal(fromScript, fromRenderer);
});

test('the generated script survives empty stdin', () => {
  const out = run(generateScript(configOf(['model'])), '');
  assert.equal(out, '\n');
});

test('the generated script survives malformed json', () => {
  const out = run(generateScript(configOf(['model'])), '{not json');
  assert.equal(typeof out, 'string');
});

test('the generated script survives a payload with the wrong types', () => {
  const broken = JSON.stringify({
    model: 'a string, not an object',
    context_window: null,
    rate_limits: { seven_day: { used_percentage: 'oops', resets_at: 'never' } },
    cost: []
  });
  assert.doesNotThrow(() => run(generateScript(configOf(CATALOG.map(s => s.id))), broken));
});

test('config round-trips', () => {
  const cfg = configOf(['model', 'ctx_used']);
  const back = parseConfigJson(generateConfigJson(cfg));
  assert.deepEqual(back.segments.map(s => s.id), ['model', 'ctx_used']);
  assert.equal(back.separator, ' | ');
  assert.equal(back.lineCount, 1);
});

test('an abbreviated config is rehydrated from the catalogue', () => {
  const back = parseConfigJson(JSON.stringify({ segments: [{ id: 'model' }], lineCount: 1 }));
  assert.equal(back.segments[0].source.path, 'model.display_name');
});

test('a config without segments is rejected', () => {
  assert.throws(() => parseConfigJson('{}'), /segments/);
});

test('the prompt names every chosen segment and carries the config', () => {
  const prompt = generatePrompt(configOf(['model', 'limit_5h']));
  assert.match(prompt, /`model`/);
  assert.match(prompt, /`limit_5h`/);
  assert.match(prompt, /rate_limits\.five_hour\.used_percentage/);
  assert.match(prompt, /statusLine/);
});

test('the settings snippet is valid json pointing at node', () => {
  const parsed = JSON.parse(generateSettingsSnippet('C:/x/statusline.js'));
  assert.equal(parsed.statusLine.type, 'command');
  assert.equal(parsed.statusLine.command, 'node C:/x/statusline.js');
});

// ---- blocks, per-line separators, custom labels ----

const richConfig = () => {
  const cfg = configOf(['model', 'project_dir', 'ctx_used', 'limit_7d', 'limit_5h_reset']);
  cfg.segments.splice(2, 0, makeBlock('block_1', '::'));
  cfg.segments[0].showLabel = true;
  cfg.segments[0].label = 'mein modell';
  cfg.segments[4].line = 1;
  cfg.segments[5].line = 1;
  cfg.lineCount = 2;
  cfg.separators = [' ~ ', ' # '];
  return cfg;
};

test('blocks, per-line separators and custom labels reach the generated script', () => {
  const cfg = richConfig();
  const out = run(generateScript(cfg), payloadText, { SL_NOW: String(FROZEN_NOW) });
  const clean = out.replace(/\u001b\[[0-9;]*m/g, '');
  assert.match(clean, /mein modell: Opus 5/);
  assert.match(clean, /::/);
  assert.match(clean.split('\n')[0], / ~ /);
  assert.match(clean.split('\n')[1], / # /);
});

test('the rich config keeps byte parity with the preview renderer', () => {
  const cfg = richConfig();
  assert.equal(
    run(generateScript(cfg), payloadText, { SL_NOW: String(FROZEN_NOW) }),
    renderAnsi(cfg, payload, FROZEN_NOW) + '\n'
  );
});

test('a generated script can be read back into the same config', () => {
  const cfg = richConfig();
  const back = parseAnyConfig(generateScript(cfg));
  assert.deepEqual(back.segments.map(s => s.id), cfg.segments.map(s => s.id));
  assert.deepEqual(back.separators, [' ~ ', ' # ', ' ~ '].slice(0, 2).concat([' | ']));
  assert.equal(back.lineCount, 2);
  assert.equal(back.segments[0].label, 'mein modell');
  assert.equal(back.segments[2].source.value, '::');
});

test('re-reading a script and regenerating it produces the identical file', () => {
  const first = generateScript(richConfig());
  const second = generateScript(parseAnyConfig(first));
  assert.equal(second, first);
});

test('extractCfgLiteral copes with braces inside strings', () => {
  const script = 'const CFG = {"a":"}{","b":{"c":1}};\nconst rest = 2;';
  assert.deepEqual(JSON.parse(extractCfgLiteral(script)), { a: '}{', b: { c: 1 } });
});

test('parseAnyConfig also takes a plain config json', () => {
  const back = parseAnyConfig(generateConfigJson(configOf(['model'])));
  assert.deepEqual(back.segments.map(s => s.id), ['model']);
});

test('parseAnyConfig explains itself when handed a bash statusline', () => {
  const sh = '#!/usr/bin/env bash\ninput=$(cat)\nmodel=$(echo "$input" | jq -r .model.display_name)\n';
  assert.throws(() => parseAnyConfig(sh), /Bash-Statusline/);
});

test('parseAnyConfig rejects unrelated text and empty input', () => {
  assert.throws(() => parseAnyConfig('guten morgen'), /CFG-Block/);
  assert.throws(() => parseAnyConfig('   '), /Nichts zum Einlesen/);
});

test('a block survives a config round-trip without a catalogue entry', () => {
  const cfg = { ...configOf(['model']), segments: [makeBlock('block_9', '>>')] };
  const back = parseConfigJson(generateConfigJson(cfg));
  assert.equal(back.segments.length, 1);
  assert.equal(back.segments[0].source.value, '>>');
});
