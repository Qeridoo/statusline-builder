// Runs the built bundle against a minimal DOM shim.
//
// The element ids come from index.template.html rather than a hand-kept list,
// so a typo in either file makes getElementById return null and mount() throw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildBundle } from '../build.js';

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
    checked: false,
    hidden: false,
    readOnly: false,
    disabled: false,
    appendChild(child) { node.children.push(child); return child; },
    replaceChildren(...next) { node.children = next; },
    remove() {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    setAttribute(key, value) {
      node.attributes[key] = String(value);
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
    },
    hasListener(type) { return (listeners.get(type) || []).length > 0; }
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

  const store = new Map();
  const document = {
    readyState: 'complete',
    activeElement: makeElement('body'),
    getElementById: id => (byId.has(id) ? byId.get(id) : null),
    querySelectorAll: selector => (selector === '.tab' ? tabs : []),
    createElement: makeElement,
    addEventListener() {},
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
    JSON, Math, Date, Number, String, Boolean, Array, Object, Error, Set, Map, RegExp, Intl,
    URL, Blob: class {}
  };
  sandbox.globalThis = sandbox;
  return { sandbox, byId, tabs, store };
}

const boot = () => {
  const ctx = makeSandbox();
  runInNewContext(buildBundle(), ctx.sandbox);
  return ctx;
};

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
  const chips = walk(byId.get('catalog')).filter(n => n.className === 'chip');
  const rows = walk(byId.get('rows')).filter(n => n.className === 'row');
  assert.equal(chips.length, 44);
  assert.equal(rows.length, 11);
  assert.equal(chips.filter(c => c.getAttribute('aria-pressed') === 'true').length, 11);
});

test('clicking an inactive chip adds a row', () => {
  const { byId } = boot();
  const before = walk(byId.get('rows')).filter(n => n.className === 'row').length;
  const off = walk(byId.get('catalog')).find(n => n.className === 'chip' && n.getAttribute('aria-pressed') === 'false');
  assert.ok(off, 'no inactive chip found');
  off.fire('click');
  const after = walk(byId.get('rows')).filter(n => n.className === 'row').length;
  assert.equal(after, before + 1);
});

test('the sort dropdown reorders the rows', () => {
  const { byId } = boot();
  const idsNow = () => walk(byId.get('rows')).filter(n => n.className === 'row__id').map(n => n.textContent);
  const before = idsNow();
  const sort = byId.get('sort');
  sort.value = 'alpha';
  sort.fire('change');
  const after = idsNow();
  assert.notDeepEqual(after, before);
  assert.deepEqual(after, before.slice().sort((a, b) => a.localeCompare(b)));
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

test('switching the export tab swaps the output', () => {
  const { byId, tabs } = boot();
  const out = byId.get('export-out');
  const script = out.value;
  tabs.find(t => t.dataset.tab === 'prompt').fire('click');
  assert.notEqual(out.value, script);
  assert.match(out.value, /Statusline/);
  tabs.find(t => t.dataset.tab === 'config').fire('click');
  assert.match(out.value, /"segments"/);
  assert.equal(byId.get('import').hidden, false);
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
  const empty = walk(byId.get('rows')).filter(n => n.className === 'empty');
  assert.equal(empty.length, 1);
});

test('state survives a reload through localStorage', () => {
  const ctx = makeSandbox();
  runInNewContext(buildBundle(), ctx.sandbox);
  ctx.byId.get('clear-all').fire('click');

  const second = makeSandbox();
  second.store.set('statusline-builder:v1', ctx.store.get('statusline-builder:v1'));
  runInNewContext(buildBundle(), second.sandbox);
  assert.equal(walk(second.byId.get('rows')).filter(n => n.className === 'row').length, 0);
});
