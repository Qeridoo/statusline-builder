// One state object, one persistence key, one notification channel.

import { CATALOG_BY_ID, REFERENCE_ORDER, isBlock } from './catalog.js';
import { DEFAULT_INSTALL_PATH, MAX_LINES } from './generate.js';
import { DEFAULT_SEPARATOR } from './render.js';

const KEY = 'statusline-builder:v1';

export function defaultState() {
  return {
    segments: REFERENCE_ORDER.map(id => ({ ...CATALOG_BY_ID[id] })),
    separator: DEFAULT_SEPARATOR,
    separators: Array.from({ length: MAX_LINES }, () => DEFAULT_SEPARATOR),
    dimSeparator: true,
    lineCount: 1,
    sort: 'manual',
    preview: { ctx: 10, fiveHour: 1, sevenDay: 32 },
    installPath: DEFAULT_INSTALL_PATH,
    tab: 'script',
    loadDraft: ''
  };
}

// Catalogue fields win for anything the user never touched, so an old saved
// state still picks up catalogue fixes. Blocks are user-made and carry
// themselves — they have no catalogue entry to merge with.
function rehydrate(segments) {
  if (!Array.isArray(segments)) return defaultState().segments;
  return segments
    .filter(s => s && (isBlock(s) || CATALOG_BY_ID[s.id]))
    .map(s => (isBlock(s) ? { ...s } : { ...CATALOG_BY_ID[s.id], ...s }));
}

function normaliseSeparators(stored, fallback) {
  const given = Array.isArray(stored) ? stored : [];
  return Array.from({ length: MAX_LINES }, (_, i) =>
    (typeof given[i] === 'string' ? given[i] : fallback));
}

function load() {
  const base = defaultState();
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!stored) return base;
    const separator = typeof stored.separator === 'string' ? stored.separator : base.separator;
    return {
      ...base,
      ...stored,
      separator,
      separators: normaliseSeparators(stored.separators, separator),
      segments: rehydrate(stored.segments),
      preview: { ...base.preview, ...(stored.preview || {}) }
    };
  } catch {
    return base;
  }
}

let state = null;
const listeners = new Set();

export function getState() {
  if (!state) state = load();
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function commit() {
  const current = getState();
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode or a full quota: the app still works, it just forgets.
  }
  listeners.forEach(fn => fn(current));
}

export function patch(values) {
  Object.assign(getState(), values);
  commit();
}

export function reset() {
  state = defaultState();
  commit();
}

export function toConfig() {
  const s = getState();
  return {
    segments: s.segments,
    separator: s.separator,
    separators: s.separators,
    dimSeparator: s.dimSeparator,
    lineCount: s.lineCount
  };
}
