import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrapText, assignSlots, buildCheatsheetSvg, cheatsheetGeometry, escapeXml, REPO_URL } from '../src/cheatsheet.js';
import { CATALOG_BY_ID, REFERENCE_ORDER, makeBlock, helpText } from '../src/catalog.js';
import { setLang, LANGS } from '../src/i18n.js';

// The explanations below are the German ones, so pin the language.
setLang('de');

const payload = JSON.parse(readFileSync(new URL('../sample-payload.json', import.meta.url)));
const FROZEN_NOW = 1786442400000;

// A predictable stand-in for canvas measurement: monospace advances at 0.6 em,
// emoji take two cells, proportional text averages 0.55 em.
const measure = (text, size, family) => {
  const chars = Array.from(String(text));
  if (family === 'mono') {
    const cells = chars.reduce((n, c) => n + (c.codePointAt(0) > 0x2000 ? 2 : 1), 0);
    return cells * size * 0.6;
  }
  return chars.length * size * 0.55;
};

const configOf = ids => ({
  segments: ids.map(id => ({ ...CATALOG_BY_ID[id] })),
  separator: ' | ',
  dimSeparator: true,
  lineCount: 1
});

test('wrapText breaks on words and respects the limit', () => {
  const lines = wrapText('eins zwei drei vier fuenf sechs', 12);
  for (const line of lines) assert.ok(line.length <= 12, line);
  assert.equal(lines.join(' '), 'eins zwei drei vier fuenf sechs');
});

test('wrapText keeps an over-long word rather than losing it', () => {
  assert.deepEqual(wrapText('kurz unterbrechungsfrei', 8), ['kurz', 'unterbrechungsfrei']);
});

test('wrapText tolerates empty input', () => {
  assert.deepEqual(wrapText('', 10), []);
  assert.deepEqual(wrapText(undefined, 10), []);
});

test('assignSlots alternates sides in anchor order', () => {
  const { callouts } = assignSlots([
    { anchor: 300, width: 40 },
    { anchor: 100, width: 40 },
    { anchor: 200, width: 40 }
  ]);
  assert.deepEqual(callouts.map(c => c.anchor), [100, 200, 300]);
  assert.deepEqual(callouts.map(c => c.side), ['top', 'bottom', 'top']);
});

test('assignSlots never overlaps two labels in the same row', () => {
  const callouts = Array.from({ length: 14 }, (_, i) => ({ anchor: i * 30, width: 120 }));
  const { callouts: placed } = assignSlots(callouts);

  for (const side of ['top', 'bottom']) {
    const bySide = placed.filter(c => c.side === side);
    const rows = new Map();
    for (const c of bySide) {
      if (!rows.has(c.row)) rows.set(c.row, []);
      rows.get(c.row).push(c);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.left - b.left);
      for (let i = 1; i < row.length; i++) {
        assert.ok(row[i].left >= row[i - 1].left + row[i - 1].width, side + ' row ' + row[i].row + ' overlaps');
      }
    }
  }
});

test('assignSlots reports how many rows each side needs', () => {
  const { topRows, bottomRows } = assignSlots([{ anchor: 0, width: 10 }, { anchor: 500, width: 10 }]);
  assert.equal(topRows, 1);
  assert.equal(bottomRows, 1);
});

test('the cheat sheet is a single svg carrying the line and the repo link', () => {
  const svg = buildCheatsheetSvg(configOf(REFERENCE_ORDER), payload, measure, { now: FROZEN_NOW });
  assert.ok(svg.startsWith('<svg '), svg.slice(0, 40));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.equal(svg.split('<svg ').length - 1, 1);
  assert.ok(svg.includes(REPO_URL));
  assert.ok(svg.includes('Opus 5'));
  assert.ok(svg.includes('Claude Code Statusline'));
  assert.ok(svg.includes('Verbrauch im laufenden'), 'German help text expected');
});

test('every annotated segment gets a callout with its explanation', () => {
  const svg = buildCheatsheetSvg(configOf(['model', 'ctx_used', 'limit_7d']), payload, measure, { now: FROZEN_NOW });
  assert.ok(svg.includes('>MODEL<'));
  assert.ok(svg.includes('>CTX<'));
  assert.ok(svg.includes('>7D<'));
  // First words of the help texts, after wrapping.
  assert.ok(svg.includes('Das Modell, das gerade'));
  assert.ok(svg.includes('Kontextfenster'));
});

test('segments without an explanation get no callout', () => {
  const config = configOf(['model']);
  config.segments.push(makeBlock('block_1', '::'));
  const svg = buildCheatsheetSvg(config, payload, measure, { now: FROZEN_NOW });
  assert.ok(svg.includes('::'), 'the block itself is drawn');
  assert.equal(svg.includes('>BLOCK<'), false);
});

test('payload text is xml-escaped', () => {
  const evil = { ...payload, session_name: '</text><script>alert(1)</script>' };
  const svg = buildCheatsheetSvg(configOf(['session_name']), evil, measure, { now: FROZEN_NOW });
  assert.equal(svg.includes('<script>'), false);
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('escapeXml covers the five predefined entities', () => {
  assert.equal(escapeXml('&<>"\''), '&amp;&lt;&gt;&quot;&apos;');
});

test('the svg grows with the number of segments but keeps a minimum width', () => {
  const small = buildCheatsheetSvg(configOf(['model']), payload, measure, { now: FROZEN_NOW });
  const large = buildCheatsheetSvg(configOf(REFERENCE_ORDER), payload, measure, { now: FROZEN_NOW });
  // Anchored to the opening tag: stroke-width elsewhere would otherwise match.
  const dim = svg => {
    const tag = /^<svg [^>]*>/.exec(svg)[0];
    return {
      w: Number(/ width="(\d+)"/.exec(tag)[1]),
      h: Number(/ height="(\d+)"/.exec(tag)[1])
    };
  };
  assert.equal(dim(small).w, 940, 'minimum width holds');
  assert.ok(dim(large).h > dim(small).h, 'more callouts need more height');
  assert.ok(dim(large).w >= 940);
});

test('a two-line status line renders both rows', () => {
  const config = configOf(['model', 'project_dir']);
  config.segments[1].line = 1;
  config.lineCount = 2;
  config.separators = [' | ', ' · '];
  const svg = buildCheatsheetSvg(config, payload, measure, { now: FROZEN_NOW });
  assert.ok(svg.includes('Opus 5'));
  assert.ok(svg.includes('Claude Code'));
});

test('an empty config still produces a valid svg', () => {
  const svg = buildCheatsheetSvg({ segments: [], lineCount: 1 }, payload, measure, { now: FROZEN_NOW });
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});

test('every catalogue segment is explained in every language', () => {
  for (const language of LANGS) {
    const missing = Object.values(CATALOG_BY_ID)
      .filter(s => !helpText(s, language) || helpText(s, language).length < 12)
      .map(s => s.id);
    assert.deepEqual(missing, [], language);
  }
});

test('the cheat sheet follows the language', () => {
  setLang('en');
  const english = buildCheatsheetSvg(configOf(['model']), payload, measure, { now: FROZEN_NOW });
  setLang('de');
  const german = buildCheatsheetSvg(configOf(['model']), payload, measure, { now: FROZEN_NOW });

  assert.ok(english.includes('Claude Code status line'));
  assert.ok(english.includes('The model that is'));
  assert.ok(german.includes('Claude Code Statusline'));
  assert.ok(german.includes('Das Modell, das gerade'));
});

test('no callout runs off the canvas, however far out its segment sits', () => {
  const g = cheatsheetGeometry(configOf(REFERENCE_ORDER), payload, measure, { now: FROZEN_NOW });
  for (const callout of g.callouts) {
    const left = g.originX + callout.anchor - callout.width / 2;
    const right = g.originX + callout.anchor + callout.width / 2;
    assert.ok(left >= 0, callout.label + ' überragt links: ' + left.toFixed(1));
    assert.ok(right <= g.width, callout.label + ' überragt rechts: ' + right.toFixed(1) + ' > ' + g.width);
  }
});

test('the status line itself stays inside the canvas', () => {
  const g = cheatsheetGeometry(configOf(REFERENCE_ORDER), payload, measure, { now: FROZEN_NOW });
  for (const row of g.rendered) {
    const last = row.parts[row.parts.length - 1];
    assert.ok(g.originX >= 0, 'line starts left of the canvas');
    assert.ok(g.originX + last.x + last.width <= g.width, 'line runs past the right edge');
  }
});

test('a very long explanation on the last segment widens the canvas', () => {
  const wide = configOf(['model', 'mood']);
  wide.segments[1] = { ...wide.segments[1], help: 'Ein absichtlich sehr langer Erklärungstext, der deutlich breiter ausfällt als das Segment selbst und daher zusätzlichen Platz am rechten Rand braucht.' };
  const g = cheatsheetGeometry(wide, payload, measure, { now: FROZEN_NOW });
  const last = g.callouts[g.callouts.length - 1];
  assert.ok(g.originX + last.anchor + last.width / 2 <= g.width);
});
