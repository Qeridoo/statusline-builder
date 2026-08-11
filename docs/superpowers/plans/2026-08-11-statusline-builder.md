# Statusline Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-page web app that assembles a Claude Code status line from toggleable, orderable, styleable segments and exports a runnable `statusline.js`, a handover prompt, and a JSON config.

**Architecture:** Pure ES modules under `src/` hold all logic (formatting, derived maths, colour, rendering, code generation) and are unit-tested with `node --test`. A dependency-free `build.js` strips `import`/`export` lines, concatenates the modules into one inline `<script type="module">` and writes a self-contained `index.html` at the repo root — double-clickable from `file://` and valid under the Artifact CSP.

**Tech Stack:** Vanilla JavaScript (ES2022), Node 24 for tests and build, no runtime dependencies, no framework, no CDN.

## Global Constraints

- Target runtime for the generated status line: **Node**, invoked as `node <path>/statusline.js`. No Bash/jq or PowerShell emitter.
- `index.html` must be fully self-contained: no external scripts, stylesheets, fonts, or images. Emoji come from the system font stack.
- Rate-limit buckets are exactly `five_hour` and `seven_day`. No five-day bucket.
- `resets_at` parsing: number `< 1e11` treated as epoch seconds; number `>= 1e11` as milliseconds; string via `Date.parse`.
- Every segment defaults to `hideWhen: 'empty'` — an unresolvable source drops the segment instead of printing a blank.
- The generated script never throws: rendering is wrapped in `try/catch` with a minimal `model` plus directory fallback.
- No file under `src/` exceeds ~300 lines; split by responsibility if it does.
- The app must not write to `~/.claude/settings.json`. It displays the snippet only.

---

### Task 1: Scaffold, sample payload, test harness

**Files:**
- Create: `package.json`, `sample-payload.json`

**Interfaces:**
- Produces: `sample-payload.json` — the canonical fixture every later test loads.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "statusline-builder",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "build": "node build.js"
  }
}
```

- [ ] **Step 2: Write `sample-payload.json`**

A payload matching the schema in the spec, with `rate_limits.seven_day.used_percentage` 32.4,
`five_hour.used_percentage` 1.2, `context_window.used_percentage` 10.4,
`cost.total_lines_added` 503, `total_lines_removed` 16, `effort.level` high,
`model.display_name` "Opus 5", `session_name` "statusline-builder",
`workspace.project_dir` "C:/Users/dev/projects/Claude Code".
`resets_at` values written as epoch seconds.

- [ ] **Step 3: Verify the fixture parses**

Run: `node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('sample-payload.json','utf8'))).length)"`
Expected: prints a number at or above 15

- [ ] **Step 4: Commit**

```bash
git add package.json sample-payload.json
git commit -m "chore: scaffold statusline builder with sample payload"
```

---

### Task 2: Value formatters

**Files:**
- Create: `src/format.js`
- Test: `test/format.test.js`

**Interfaces:**
- Produces:
  - `fmtPercent(n, opts) -> string` — opts `{decimals, sign}`
  - `fmtNumber(n, opts) -> string` — 95000 becomes "95k", 1200000 becomes "1.2M"
  - `fmtDuration(ms) -> string` — 17640000 becomes "4h54m", 3240000 becomes "54m"
  - `fmtCountdown(resetsAt, now) -> string` — same shape, "now" when past
  - `fmtCurrency(usd) -> string` — 1.234 becomes "$1.23"
  - `fmtPath(p, opts) -> string` — modes `basename`, `last2`, `full`, `tilde`
  - `fmtText(s, opts) -> string` — truncates with an ellipsis
  - `parseResetsAt(v) -> number|null` — epoch **milliseconds**, per Global Constraints

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtNumber, fmtDuration, fmtCountdown, fmtPath, parseResetsAt } from '../src/format.js';

test('fmtNumber abbreviates', () => {
  assert.equal(fmtNumber(950), '950');
  assert.equal(fmtNumber(95000), '95k');
  assert.equal(fmtNumber(1200000), '1.2M');
});

test('fmtDuration drops zero hours', () => {
  assert.equal(fmtDuration(17640000), '4h54m');
  assert.equal(fmtDuration(3240000), '54m');
});

test('parseResetsAt handles seconds, millis and ISO', () => {
  assert.equal(parseResetsAt(1786800000), 1786800000000);
  assert.equal(parseResetsAt(1786800000000), 1786800000000);
  assert.equal(parseResetsAt('2026-08-11T10:00:00Z'), Date.parse('2026-08-11T10:00:00Z'));
  assert.equal(parseResetsAt(null), null);
});

test('fmtCountdown returns now when elapsed', () => {
  assert.equal(fmtCountdown(1000, 2000), 'now');
});

test('fmtPath handles windows separators', () => {
  const p = 'C:/Users/dev/projects/Claude Code/statusline';
  assert.equal(fmtPath(p, { mode: 'basename' }), 'statusline');
  assert.equal(fmtPath(p, { mode: 'last2' }), 'Claude Code/statusline');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/format.test.js`
Expected: FAIL — cannot find module `../src/format.js`

- [ ] **Step 3: Implement `src/format.js`**

Pure functions, no imports. `fmtNumber` uses thresholds 1e6 then 1e3, one decimal only when
the abbreviated value is below 10. `fmtDuration` floors to whole minutes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/format.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/format.js test/format.test.js
git commit -m "feat: add value formatters"
```

---

### Task 3: Derived weekly metrics

**Files:**
- Create: `src/derive.js`
- Test: `test/derive.test.js`

**Interfaces:**
- Consumes: `parseResetsAt` from `src/format.js`
- Produces:
  - `weeklyWindow(payload, now)` returning `{used, resetsAt, elapsedFraction, daysLeft}` or `null`
  - `evenBurn(payload, now) -> number|null` — signed delta in percentage points
  - `pace(payload, now) -> number|null` — sustainable percent per day
  - `todayLeft(payload, now) -> number|null` — percent of today's slice remaining, may be negative
  - `mood(payload, now) -> number|null` — the worst meter, 0 to 100
  - `WINDOW_MS` — 7 days in milliseconds

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evenBurn, pace, todayLeft, mood, WINDOW_MS } from '../src/derive.js';

const at = (usedPct, elapsedFraction) => {
  const now = 1786000000000;
  const resetsAt = now + WINDOW_MS * (1 - elapsedFraction);
  return [{ rate_limits: { seven_day: { used_percentage: usedPct, resets_at: resetsAt } } }, now];
};

test('evenBurn is negative when under the line', () => {
  const [p, now] = at(32, 0.43);
  assert.ok(evenBurn(p, now) < 0);
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/derive.test.js`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement `src/derive.js`**

`weeklyWindow` clamps `elapsedFraction` into 0 to 1 and floors `daysLeft` at one twenty-fourth
so `pace` never divides by zero. `todayLeft` uses day index `Math.floor(f * 7)`, slice
`100 / 7`, used-today `used - dayIndex * slice`, and returns
`(slice - usedToday) / slice * 100` **unclamped**.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/derive.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/derive.js test/derive.test.js
git commit -m "feat: add derived weekly burn metrics"
```

---

### Task 4: Colour model

**Files:**
- Create: `src/color.js`
- Test: `test/color.test.js`

**Interfaces:**
- Produces:
  - `resolveColor(colorSpec, value) -> string|null` — a hex string
  - `hexToAnsi(hex) -> string` — truecolor SGR parameters, e.g. `38;2;224;108;117`
  - `ansiWrap(text, hex, opts) -> string` — opts `{dim, bold}`
  - colour spec shapes: `{mode:'static', value}`, `{mode:'threshold', stops}`,
    `{mode:'gradient', from, to, min, max}`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColor, hexToAnsi, ansiWrap } from '../src/color.js';

const stops = [[0, '#7ec699'], [50, '#e0c46c'], [90, '#e06c75']];

test('threshold picks the highest stop at or below the value', () => {
  assert.equal(resolveColor({ mode: 'threshold', stops }, 10), '#7ec699');
  assert.equal(resolveColor({ mode: 'threshold', stops }, 50), '#e0c46c');
  assert.equal(resolveColor({ mode: 'threshold', stops }, 95), '#e06c75');
});

test('gradient interpolates', () => {
  const spec = { mode: 'gradient', from: '#000000', to: '#ffffff', min: 0, max: 100 };
  assert.equal(resolveColor(spec, 0), '#000000');
  assert.equal(resolveColor(spec, 100), '#ffffff');
  assert.equal(resolveColor(spec, 50), '#808080');
});

test('hexToAnsi emits truecolor', () => {
  assert.equal(hexToAnsi('#e06c75'), '38;2;224;108;117');
});

test('ansiWrap resets afterwards', () => {
  assert.equal(ansiWrap('x', '#000000'), '\u001b[38;2;0;0;0mx\u001b[0m');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/color.test.js`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement `src/color.js`**

Gradient rounds each channel with `Math.round`. `resolveColor` returns `null` for an unknown
mode so callers can skip colouring.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/color.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/color.js test/color.test.js
git commit -m "feat: add colour resolution and ANSI wrapping"
```

---

### Task 5: Segment catalogue

**Files:**
- Create: `src/catalog.js`
- Test: `test/catalog.test.js`

**Interfaces:**
- Consumes: `src/format.js`, `src/derive.js`
- Produces:
  - `CATALOG` — an array of segments with their defaults
  - `GROUPS` — an array of `{id, label, emoji}` covering session, model, workspace, context, limits, cost, derived, status
  - `getValue(segment, payload, now)` returning `{raw, display}` or `null`
  - segment fields: `id, group, label, emoji, source, format, showLabel, showEmoji, line, color, hideWhen`
  - `source` is `{kind:'path', path}` or `{kind:'derived', fn}`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG, GROUPS, getValue } from '../src/catalog.js';

const payload = JSON.parse(readFileSync(new URL('../sample-payload.json', import.meta.url)));
const now = Date.now();

test('every segment has a unique id and a known group', () => {
  const ids = CATALOG.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(GROUPS.map(g => g.id));
  for (const s of CATALOG) assert.ok(groups.has(s.group), s.id + ' has unknown group ' + s.group);
});

test('project folder segment resolves from the sample payload', () => {
  const seg = CATALOG.find(s => s.id === 'project_dir');
  assert.equal(getValue(seg, payload, now).display, 'Claude Code');
});

test('session name segment resolves', () => {
  const seg = CATALOG.find(s => s.id === 'session_name');
  assert.equal(getValue(seg, payload, now).display, 'statusline-builder');
});

test('both rate limit buckets exist and no five-day bucket does', () => {
  assert.ok(CATALOG.find(s => s.id === 'limit_5h'));
  assert.ok(CATALOG.find(s => s.id === 'limit_7d'));
  assert.equal(CATALOG.find(s => s.id === 'limit_5d'), undefined);
});

test('no segment throws on an empty payload', () => {
  for (const s of CATALOG) assert.doesNotThrow(() => getValue(s, {}, now), s.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/catalog.test.js`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement `src/catalog.js`**

Segments to include, at minimum.

- session: `session_name`, `session_id`, `permission_mode`, `output_style`, `remote`
- model: `model`, `effort`, `fast_mode`, `thinking`, `version`
- workspace: `project_dir`, `current_dir`, `git_worktree`, `repo`, `worktree_name`, `worktree_branch`, `added_dirs`, `pr`
- context: `ctx_used`, `ctx_remaining`, `ctx_window_size`, `tokens_in`, `tokens_out`, `tokens_cache_read`, `exceeds_200k`
- limits: `limit_5h`, `limit_5h_reset`, `limit_7d`, `limit_7d_reset`
- cost: `cost_usd`, `duration`, `api_duration`, `lines_added`, `lines_removed`, `lines_delta`
- derived: `weekly_today_left`, `weekly_pace`, `weekly_even_burn`, `mood`
- status: `vim_mode`, `agent_name`, `agent_type`

`getValue` walks dotted paths safely, returns `null` when the resolved value is `undefined`,
`null`, or an empty string, and applies the segment's `format`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/catalog.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/catalog.js test/catalog.test.js
git commit -m "feat: add segment catalogue"
```

---

### Task 6: Line renderer

**Files:**
- Create: `src/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `src/catalog.js`, `src/color.js`
- Produces:
  - `renderAnsi(config, payload, now) -> string` — literal terminal output, newline between lines
  - `renderHtml(config, payload, now) -> string` — same layout as coloured spans for the preview
  - config shape `{segments, separator, dimSeparator, lineCount}`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAnsi, renderHtml } from '../src/render.js';
import { CATALOG } from '../src/catalog.js';

const payload = JSON.parse(readFileSync(new URL('../sample-payload.json', import.meta.url)));
const now = Date.now();
const strip = s => s.replace(/\u001b\[[0-9;]*m/g, '');
const pick = (...ids) => ids.map(id => ({ ...CATALOG.find(s => s.id === id) }));
const cfg = over => ({ segments: pick('model', 'project_dir'), separator: ' | ', dimSeparator: true, lineCount: 1, ...over });

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

test('renderHtml escapes markup from payload values', () => {
  const evil = { ...payload, session_name: '<img src=x>' };
  const html = renderHtml(cfg({ segments: pick('session_name') }), evil, now);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/render.test.js`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement `src/render.js`**

Group segments by `line`, drop those whose `getValue` is `null` under `hideWhen: 'empty'`,
prefix emoji and optional label, colour via `resolveColor` on the raw numeric value, join with
the separator. `renderHtml` escapes ampersand, angle brackets and quotes before wrapping in spans.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/render.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "feat: add ANSI and HTML line renderers"
```

---

### Task 7: Code generation

**Files:**
- Create: `src/generate.js`
- Test: `test/generate.test.js`

**Interfaces:**
- Consumes: `src/catalog.js`
- Produces:
  - `generateScript(config) -> string` — a complete standalone `statusline.js`
  - `generatePrompt(config) -> string` — the Claude handover text
  - `generateConfigJson(config) -> string` — pretty-printed and re-importable
  - `parseConfigJson(text) -> config` — inverse of the above, throws on a bad shape

The emitted script inlines the config as a `const CFG` literal followed by a generic renderer,
so it stays hand-editable.

- [ ] **Step 1: Write the failing test — the generated script must actually run**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateScript, generateConfigJson, parseConfigJson } from '../src/generate.js';
import { CATALOG } from '../src/catalog.js';

const payloadText = readFileSync(new URL('../sample-payload.json', import.meta.url), 'utf8');
const cfg = {
  segments: ['model', 'project_dir', 'ctx_used', 'limit_7d'].map(id => ({ ...CATALOG.find(s => s.id === id) })),
  separator: ' | ', dimSeparator: true, lineCount: 1
};

const run = (script, input) => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-'));
  const file = join(dir, 'statusline.js');
  writeFileSync(file, script);
  return execFileSync(process.execPath, [file], { input, encoding: 'utf8' });
};

test('the generated script renders the sample payload', () => {
  const out = run(generateScript(cfg), payloadText).replace(/\u001b\[[0-9;]*m/g, '');
  assert.match(out, /Opus 5/);
  assert.match(out, /Claude Code/);
  assert.match(out, /10%/);
  assert.match(out, /32%/);
});

test('the generated script survives empty stdin', () => {
  assert.doesNotThrow(() => run(generateScript(cfg), ''));
});

test('the generated script survives malformed json', () => {
  assert.equal(typeof run(generateScript(cfg), '{not json'), 'string');
});

test('config round-trips', () => {
  const back = parseConfigJson(generateConfigJson(cfg));
  assert.deepEqual(back.segments.map(s => s.id), cfg.segments.map(s => s.id));
  assert.equal(back.separator, ' | ');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/generate.test.js`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement `src/generate.js`**

The emitted runtime is a self-contained copy of the helpers it needs — it must not import from
`src/`, since it will live in the user's `.claude` directory. Wrap the whole render in
`try/catch`; the catch prints `model.display_name` and the `cwd` basename.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/generate.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/generate.js test/generate.test.js
git commit -m "feat: generate runnable statusline script, prompt and config"
```

---

### Task 8: App shell, catalogue and builder UI

**Files:**
- Create: `src/ui.js`, `src/app.css`, `src/index.template.html`

**Interfaces:**
- Consumes: everything above
- Produces: `mount(root)` — wires the DOM and owns the single `state` object

State shape `{segments, separator, dimSeparator, lineCount, preview: {ctx, fiveHour, sevenDay}}`,
persisted to `localStorage` under the key `statusline-builder:v1`.

- [ ] **Step 1: Write `src/index.template.html`**

Three-column grid: catalogue, builder, preview and export. A `BUNDLE` marker comment where
`build.js` injects the concatenated script, and a `CSS` marker comment for the stylesheet.

- [ ] **Step 2: Write `src/app.css`**

Dark terminal-leaning theme with light and dark support via `prefers-color-scheme`, tokens
defined on bare `:root`, wide regions scrollable with `overflow-x: auto`.

- [ ] **Step 3: Implement the catalogue column**

Grouped toggle list. Clicking a segment appends it to `state.segments` or removes it.

- [ ] **Step 4: Implement the builder column**

Each active segment is a row with a drag handle (HTML5 drag and drop plus up and down buttons
for keyboard access), an emoji input, a label toggle, a **format dropdown** whose options depend
on the segment's value type, a **colour mode dropdown**, and a line selector. A **sort dropdown**
above the list offers manual, by group, alphabetical, and the reference layout order.

- [ ] **Step 5: Verify in the browser**

Run: `node build.js` then open `index.html`
Expected: toggling and reordering segments updates the preview immediately.

- [ ] **Step 6: Commit**

```bash
git add src/ui.js src/app.css src/index.template.html
git commit -m "feat: add catalogue and builder UI"
```

---

### Task 9: Preview, export panel and build

**Files:**
- Create: `build.js`, `test.sh`, `README.md`, `index.html` (build output, committed)
- Modify: `src/ui.js`

**Interfaces:**
- Consumes: `renderHtml`, `generateScript`, `generatePrompt`, `generateConfigJson`, `parseConfigJson`

- [ ] **Step 1: Implement the preview panel**

Terminal-styled box showing `renderHtml`. Three sliders bound to `state.preview` override
`context_window.used_percentage`, `rate_limits.five_hour.used_percentage` and
`rate_limits.seven_day.used_percentage` in the sample payload before rendering, so threshold
colours and the mood emoji can be exercised. A collapsible textarea holds the raw payload for
pasting a real capture.

- [ ] **Step 2: Implement the export panel**

Three tabs — generated script, Claude prompt, JSON config — each with a copy button and a
download button. The config tab also accepts a paste-and-import. Below the tabs, the
`settings.json` snippet with the exact `node` command, copyable.

- [ ] **Step 3: Write `build.js`**

Reads the `src/*.js` modules in dependency order, strips lines starting with `import ` and the
leading `export ` keyword, concatenates them into one inline module script, inlines `app.css`,
and writes `index.html`. No dependencies.

- [ ] **Step 4: Write `test.sh`**

```bash
#!/usr/bin/env bash
# Pipe the sample payload through a generated statusline script.
set -euo pipefail
script="${1:-statusline.js}"
if [ ! -f "$script" ]; then
  echo "usage: ./test.sh path/to/statusline.js" >&2
  exit 1
fi
node "$script" < sample-payload.json
echo
```

- [ ] **Step 5: Run the whole suite and the build**

Run: `npm test` then `node build.js`
Expected: all tests pass; `index.html` written and self-contained

- [ ] **Step 6: Verify `index.html` has no external references**

Run: `grep -nE '(src|href)="https?://' index.html || echo self-contained`
Expected: prints `self-contained`

- [ ] **Step 7: Write `README.md`**

Covers what the app does, how to open it, the segment catalogue, the derived-metric formulas
including the stateless approximation in `weekly_today_left`, the install snippet, and the note
that `jq` is not required.

- [ ] **Step 8: Commit**

```bash
git add build.js test.sh README.md index.html src/ui.js
git commit -m "feat: add preview, export panel and self-contained build"
```

---

## Self-Review

**Spec coverage.** Payload schema is Task 5; runtime target is Task 7; segment model is Task 5;
derived metrics are Task 3; self-contained `index.html` is Task 9 Step 6; the catalogue, builder
and preview regions are Tasks 8 and 9; the config-first generated script is Task 7; styling and
separators are Tasks 4, 6 and 8; error handling is Task 7 Steps 1 and 3; test artefacts are
Tasks 1 and 9. The spec's out-of-scope items appear in no task.

**Placeholders.** None — every step names its command and its expected result.

**Type consistency.** `getValue` returns `{raw, display}` or `null` in Tasks 5, 6 and 9;
`resolveColor` takes `(spec, value)` in Tasks 4 and 6; config carries
`{segments, separator, dimSeparator, lineCount}` in Tasks 6, 7, 8 and 9; `parseResetsAt`
returns milliseconds in Tasks 2 and 3.
