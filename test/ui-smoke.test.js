// Runs the built bundle against a minimal DOM shim.
//
// The element ids come from index.template.html rather than a hand-kept list,
// so a typo in either file makes getElementById return null and mount() throw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildBundle } from '../build.js';
import { generateScript } from '../src/generate.js';
import { CATALOG_BY_ID } from '../src/catalog.js';

const template = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');

const idsInTemplate = () => {
  const ids = new Set();
  for (const match of template.matchAll(/\sid="([^"]+)"/g)) ids.add(match[1]);
  return ids;
};

const tabsInTemplate = () =>
  Array.from(template.matchAll(/class="tab"[^>]*data-tab="([^"]+)"/g)).map(m => m[1]);

function makeElement(tag = 'div') {
  const listeners = new Map();
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    dataset: {},
    attributes: {},
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    className: '',
    textContent: '',
    innerHTML: '',
    value: '',
    placeholder: '',
    checked: false,
    hidden: false,
    readOnly: false,
    disabled: false,
    clicks: 0,
    appendChild(child) { node.children.push(child); return child; },
    replaceChildren(...next) { node.children = next; },
    remove() {},
    click() { node.clicks += 1; },
    focus() {},
    select() {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    setAttribute(key, value) {
      node.attributes[key] = String(value);
      if (key === 'value') node.value = String(value);
      if (key.startsWith('data-')) {
        node.dataset[key.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(value);
      }
    },
    getAttribute(key) { return key in node.attributes ? node.attributes[key] : null; },
    querySelectorAll: () => [],
    fire(type, event = {}) {
      const handlers = listeners.get(type) || [];
      for (const fn of handlers) fn({ target: node, preventDefault() {}, ...event });
      return handlers.length;
    }
  };
  return node;
}

function walk(node, out = []) {
  out.push(node);
  for (const child of node.children || []) walk(child, out);
  return out;
}

function makeSandbox() {
  const byId = new Map();
  for (const id of idsInTemplate()) byId.set(id, makeElement('div'));

  const tabs = tabsInTemplate().map(name => {
    const tab = makeElement('button');
    tab.dataset.tab = name;
    return tab;
  });

  const anchors = [];
  const store = new Map();
  const document = {
    readyState: 'complete',
    activeElement: makeElement('body'),
    getElementById: id => (byId.has(id) ? byId.get(id) : null),
    querySelectorAll: selector => (selector === '.tab' ? tabs : []),
    createElement: tag => {
      const node = makeElement(tag);
      if (String(tag).toLowerCase() === 'a') anchors.push(node);
      return node;
    },
    addEventListener() {},
    execCommand: () => true,
    body: makeElement('body')
  };

  const sandbox = {
    document,
    window: {},
    console,
    setTimeout,
    clearTimeout,
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key)
    },
    // Node has no FileReader; the file picker only needs it to hand back text.
    FileReader: class {
      readAsText(file) {
        this.result = file && file.text !== undefined ? file.text : '';
        if (this.onload) this.onload();
      }
    },
    Blob,
    URL,
    JSON, Math, Date, Number, String, Boolean, Array, Object, Error, Set, Map, RegExp, Intl
  };
  sandbox.globalThis = sandbox;
  return { sandbox, byId, tabs, store, anchors };
}

const boot = () => {
  const ctx = makeSandbox();
  runInNewContext(buildBundle(), ctx.sandbox);
  return ctx;
};

const nodesOfClass = (byId, id, className) =>
  walk(byId.get(id)).filter(n => n.className === className);
const rowCount = byId => nodesOfClass(byId, 'rows', 'row').length;

test('the app mounts without throwing', () => {
  assert.doesNotThrow(boot);
});

test('the preview is filled on mount', () => {
  const { byId } = boot();
  const html = byId.get('preview').innerHTML;
  assert.ok(html.length > 0, 'preview is empty');
  assert.match(html, /Opus 5/);
  assert.match(html, /sl-seg/);
});

test('the export box and settings snippet are filled on mount', () => {
  const { byId } = boot();
  assert.match(byId.get('export-out').value, /^#!\/usr\/bin\/env node/);
  assert.match(byId.get('settings-snippet').value, /"command": "node /);
});

test('the catalogue renders a chip per segment and the builder a row per active one', () => {
  const { byId } = boot();
  const chips = nodesOfClass(byId, 'catalog', 'chip');
  assert.equal(chips.length, 44);
  assert.equal(rowCount(byId), 11);
  assert.equal(chips.filter(c => c.getAttribute('aria-pressed') === 'true').length, 11);
});

test('clicking an inactive chip adds a row', () => {
  const { byId } = boot();
  const before = rowCount(byId);
  const off = nodesOfClass(byId, 'catalog', 'chip').find(n => n.getAttribute('aria-pressed') === 'false');
  assert.ok(off, 'no inactive chip found');
  off.fire('click');
  assert.equal(rowCount(byId), before + 1);
});

test('the sort dropdown reorders the rows', () => {
  const { byId } = boot();
  const idsNow = () => nodesOfClass(byId, 'rows', 'row__id').map(n => n.textContent);
  const before = idsNow();
  const sort = byId.get('sort');
  sort.value = 'alpha';
  sort.fire('change');
  assert.deepEqual(idsNow(), before.slice().sort((a, b) => a.localeCompare(b)));
});

test('the line-count dropdown changes how many lines a segment can go to', () => {
  const { byId } = boot();
  const lineSelects = () => walk(byId.get('rows'))
    .filter(n => n.tagName === 'SELECT')
    .filter(n => n.children.some(o => String(o.textContent).startsWith('Zeile')));
  assert.equal(lineSelects()[0].children.length, 1);
  const lineCount = byId.get('line-count');
  lineCount.value = '3';
  lineCount.fire('change');
  assert.equal(lineSelects()[0].children.length, 3);
});

test('the preview sliders drive the rendered percentages', () => {
  const { byId } = boot();
  const slider = byId.get('pv-ctx');
  slider.value = '97';
  slider.fire('input');
  assert.match(byId.get('preview').innerHTML, /97%/);
  assert.equal(byId.get('pv-ctx-out').textContent, '97%');
});

test('clearing everything empties the preview and shows a hint', () => {
  const { byId } = boot();
  byId.get('clear-all').fire('click');
  assert.equal(byId.get('preview').innerHTML, '');
  assert.equal(nodesOfClass(byId, 'rows', 'empty').length, 1);
});

test('state survives a reload through localStorage', () => {
  const ctx = boot();
  ctx.byId.get('clear-all').fire('click');

  const second = makeSandbox();
  second.store.set('statusline-builder:v1', ctx.store.get('statusline-builder:v1'));
  runInNewContext(buildBundle(), second.sandbox);
  assert.equal(rowCount(second.byId), 0);
});

// ---- separators per line ----

test('each line gets its own separator input', () => {
  const { byId } = boot();
  const inputs = () => walk(byId.get('separators')).filter(n => n.tagName === 'INPUT');
  assert.equal(inputs().length, 1);

  const lineCount = byId.get('line-count');
  lineCount.value = '3';
  lineCount.fire('change');
  assert.equal(inputs().length, 3);
});

test('editing a separator changes the preview', () => {
  const { byId } = boot();
  const separator = walk(byId.get('separators')).find(n => n.tagName === 'INPUT');
  separator.value = ' ~~ ';
  separator.fire('input');
  assert.ok(byId.get('preview').innerHTML.includes('~~'));
});

// ---- custom labels ----

test('typing a label shows it in the preview, clearing it hides it again', () => {
  const { byId } = boot();
  const label = nodesOfClass(byId, 'rows', 'row__label')[0];
  label.value = 'mdl';
  label.fire('input');
  assert.match(byId.get('preview').innerHTML, /mdl:/);

  label.value = '';
  label.fire('input');
  assert.equal(/mdl:/.test(byId.get('preview').innerHTML), false);
});

// ---- literal blocks ----

test('adding a block inserts a row whose text lands in the preview', () => {
  const { byId } = boot();
  const before = rowCount(byId);
  byId.get('add-block').fire('click');
  assert.equal(rowCount(byId), before + 1);

  const blockInput = nodesOfClass(byId, 'rows', 'row__block')[0];
  assert.ok(blockInput, 'block row has no text input');
  blockInput.value = '<<>>';
  blockInput.fire('input');
  assert.ok(byId.get('preview').innerHTML.includes('&lt;&lt;&gt;&gt;'));
});

test('blocks get unique ids', () => {
  const { byId } = boot();
  byId.get('add-block').fire('click');
  byId.get('add-block').fire('click');
  const ids = nodesOfClass(byId, 'rows', 'row__id').map(n => n.textContent).filter(t => t.startsWith('block_'));
  assert.deepEqual(ids, ['block_1', 'block_2']);
});

// ---- export panel ----

test('switching the export tab swaps the output', () => {
  const { byId, tabs } = boot();
  const out = byId.get('export-out');
  const script = out.value;

  tabs.find(t => t.dataset.tab === 'prompt').fire('click');
  assert.notEqual(out.value, script);
  assert.match(out.value, /Statusline/);

  tabs.find(t => t.dataset.tab === 'config').fire('click');
  assert.match(out.value, /"segments"/);
  assert.equal(byId.get('import').hidden, true);

  tabs.find(t => t.dataset.tab === 'load').fire('click');
  assert.equal(out.value, '');
  assert.equal(byId.get('import').hidden, false);
  assert.equal(byId.get('load-controls').hidden, false);
});

test('download builds a named anchor and clicks it', () => {
  const { byId, anchors } = boot();
  byId.get('download').fire('click');
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].download, 'statusline.js');
  assert.equal(anchors[0].clicks, 1);
  assert.ok(String(anchors[0].href).length > 0);
});

test('download names the file after the active tab', () => {
  const { byId, tabs, anchors } = boot();
  tabs.find(t => t.dataset.tab === 'config').fire('click');
  byId.get('download').fire('click');
  assert.equal(anchors[0].download, 'statusline-config.json');
});

// ---- loading an existing status line ----

const twoSegmentScript = generateScript({
  segments: [{ ...CATALOG_BY_ID.model }, { ...CATALOG_BY_ID.session_name }],
  separator: ' :: ',
  lineCount: 1
});

test('loading a generated script rebuilds rows, chips and the export view', () => {
  const { byId, tabs } = boot();
  assert.equal(rowCount(byId), 11);

  tabs.find(t => t.dataset.tab === 'load').fire('click');
  byId.get('export-out').value = twoSegmentScript;
  byId.get('import').fire('click');

  // The builder must follow the import, not just the preview — this was the bug.
  assert.equal(rowCount(byId), 2);
  assert.deepEqual(nodesOfClass(byId, 'rows', 'row__id').map(n => n.textContent), ['model', 'session_name']);
  assert.equal(
    nodesOfClass(byId, 'catalog', 'chip').filter(c => c.getAttribute('aria-pressed') === 'true').length,
    2
  );

  // …and it lands back on the script tab showing the imported config.
  assert.match(byId.get('export-out').value, /^#!\/usr\/bin\/env node/);
  assert.match(byId.get('export-out').value, /"separator": " :: "/);
  assert.match(byId.get('export-hint').textContent, /Übernommen — 2 Segmente/);
});

test('a bad paste reports why and leaves the config alone', () => {
  const { byId, tabs } = boot();
  const before = rowCount(byId);
  tabs.find(t => t.dataset.tab === 'load').fire('click');
  byId.get('export-out').value = '#!/usr/bin/env bash\njq -r .model';
  byId.get('import').fire('click');
  assert.match(byId.get('export-hint').textContent, /Bash-Statusline/);
  tabs.find(t => t.dataset.tab === 'script').fire('click');
  assert.equal(rowCount(byId), before);
});

test('an imported layout survives a reload', () => {
  const ctx = boot();
  ctx.tabs.find(t => t.dataset.tab === 'load').fire('click');
  ctx.byId.get('export-out').value = twoSegmentScript;
  ctx.byId.get('import').fire('click');

  const second = makeSandbox();
  second.store.set('statusline-builder:v1', ctx.store.get('statusline-builder:v1'));
  runInNewContext(buildBundle(), second.sandbox);
  assert.deepEqual(
    nodesOfClass(second.byId, 'rows', 'row__id').map(n => n.textContent),
    ['model', 'session_name']
  );
});

test('blocks survive a reload', () => {
  const ctx = boot();
  ctx.byId.get('add-block').fire('click');
  const blockInput = nodesOfClass(ctx.byId, 'rows', 'row__block')[0];
  blockInput.value = '§§';
  blockInput.fire('input');

  const second = makeSandbox();
  second.store.set('statusline-builder:v1', ctx.store.get('statusline-builder:v1'));
  runInNewContext(buildBundle(), second.sandbox);
  assert.ok(nodesOfClass(second.byId, 'rows', 'row__block').some(n => n.value === '§§'));
  assert.ok(second.byId.get('preview').innerHTML.includes('§§'));
});
