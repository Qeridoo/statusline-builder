// One state object, one persistence key, one notification channel.

import { CATALOG_BY_ID, REFERENCE_ORDER } from './catalog.js';
import { DEFAULT_INSTALL_PATH } from './generate.js';

const KEY = 'statusline-builder:v1';

export function defaultState() {
  return {
    segments: REFERENCE_ORDER.map(id => ({ ...CATALOG_BY_ID[id] })),
    separator: ' | ',
    dimSeparator: true,
    lineCount: 1,
    sort: 'manual',
    preview: { ctx: 10, fiveHour: 1, sevenDay: 32 },
    installPath: DEFAULT_INSTALL_PATH,
    tab: 'script'
  };
}

// Segments are stored with their full definition so an old saved state still
// works, but catalogue fields win for anything the user never touched.
function rehydrate(segments) {
  if (!Array.isArray(segments)) return defaultState().segments;
  return segments
    .filter(s => s && CATALOG_BY_ID[s.id])
    .map(s => ({ ...CATALOG_BY_ID[s.id], ...s }));
}

function load() {
  const base = defaultState();
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!stored) return base;
    return {
      ...base,
      ...stored,
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
    dimSeparator: s.dimSeparator,
    lineCount: s.lineCount
  };
}
