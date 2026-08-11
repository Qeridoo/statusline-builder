// The segment catalogue. Everything the builder offers is data in this file —
// the renderer and the code generator stay generic.

import {
  fmtPercent, fmtNumber, fmtDuration, fmtCountdown, fmtCurrency,
  fmtPath, fmtText, fmtBool, parseResetsAt
} from './format.js';
import { evenBurn, pace, todayLeft, mood } from './derive.js';

export const GROUPS = [
  { id: 'session', label: 'Session', emoji: '🪪' },
  { id: 'model', label: 'Modell', emoji: '🤖' },
  { id: 'workspace', label: 'Workspace', emoji: '📁' },
  { id: 'context', label: 'Kontext', emoji: '🧠' },
  { id: 'limits', label: 'Limits', emoji: '⏱️' },
  { id: 'cost', label: 'Kosten', emoji: '💰' },
  { id: 'derived', label: 'Abgeleitet', emoji: '📈' },
  { id: 'status', label: 'Status', emoji: '🚦' }
];

// Shared colour presets. "usage" goes green to red as a meter fills, "inverse"
// is for values where more is better.
export const USAGE = {
  mode: 'threshold',
  stops: [[0, '#7ec699'], [50, '#e0c46c'], [75, '#e5a95f'], [90, '#e06c75']]
};
export const INVERSE = {
  mode: 'threshold',
  stops: [[0, '#e06c75'], [25, '#e5a95f'], [50, '#e0c46c'], [75, '#7ec699']]
};
export const BURN = {
  mode: 'threshold',
  stops: [[-100, '#7ec699'], [0, '#e0c46c'], [10, '#e06c75']]
};
const plain = value => ({ mode: 'static', value });

const TEXT = plain('#c8ccd4');
const MUTED = plain('#8a90a0');
const ACCENT = plain('#a78bfa');
const GREEN = plain('#7ec699');
const RED = plain('#e06c75');
const BLUE = plain('#6cb6ff');

export const MOOD_STOPS = [[0, '😺'], [30, '😼'], [50, '🙀'], [70, '😾']];

const EFFORT_SCALE = { low: 0, medium: 30, high: 60, xhigh: 80, max: 100 };

// Derived values. Each receives the whole payload and may return a number,
// a string, or null.
export const DERIVED = {
  todayLeft: (p, now) => todayLeft(p, now),
  pace: (p, now) => pace(p, now),
  evenBurn: (p, now) => evenBurn(p, now),
  mood: p => mood(p),
  linesDelta: p => {
    const added = Number(p && p.cost && p.cost.total_lines_added);
    const removed = Number(p && p.cost && p.cost.total_lines_removed);
    if (!Number.isFinite(added) && !Number.isFinite(removed)) return null;
    return '+' + (Number.isFinite(added) ? added : 0) + '/-' + (Number.isFinite(removed) ? removed : 0);
  },
  contextLeftTokens: p => {
    const size = Number(p && p.context_window && p.context_window.context_window_size);
    const pct = Number(p && p.context_window && p.context_window.remaining_percentage);
    if (!Number.isFinite(size) || !Number.isFinite(pct)) return null;
    return (size * pct) / 100;
  }
};

function getPath(obj, path) {
  if (!obj || !path) return null;
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = cur[key];
  }
  return cur === undefined ? null : cur;
}

export function applyFormat(raw, format, now) {
  const f = format || {};
  const type = f.type || 'text';
  let out = null;

  switch (type) {
    case 'raw':
      out = raw === null || raw === undefined ? null : String(raw);
      break;
    case 'path':
      out = fmtPath(raw, { mode: f.mode || 'basename' });
      break;
    case 'percent':
      out = fmtPercent(raw, f);
      break;
    case 'number':
      out = fmtNumber(raw, f);
      break;
    case 'duration':
      out = fmtDuration(raw);
      break;
    case 'countdown':
      out = fmtCountdown(parseResetsAt(raw), now);
      break;
    case 'currency':
      out = fmtCurrency(raw);
      break;
    case 'bool':
      out = fmtBool(raw, f);
      break;
    case 'count': {
      const n = Array.isArray(raw) ? raw.length : Number(raw);
      out = Number.isFinite(n) && n > 0 ? String(n) : null;
      break;
    }
    case 'arrow': {
      const v = Number(raw);
      if (!Number.isFinite(v)) break;
      const arrow = v < -0.5 ? '▼' : v > 0.5 ? '▲' : '▬';
      out = arrow + Math.abs(v).toFixed(f.decimals || 0);
      break;
    }
    case 'emojiScale': {
      const v = Number(raw);
      if (!Number.isFinite(v)) break;
      const stops = (f.stops || MOOD_STOPS).slice().sort((a, b) => a[0] - b[0]);
      out = stops[0][1];
      for (const [at, emoji] of stops) if (v >= at) out = emoji;
      break;
    }
    default: {
      let s = raw === null || raw === undefined ? null : String(raw);
      if (s !== null && f.slice) s = s.slice(0, f.slice);
      out = s === null ? null : fmtText(s, { max: f.max });
    }
  }

  if (out === null || out === undefined || out === '') return null;
  if (f.prefix) out = f.prefix + out;
  if (f.suffix) out = out + f.suffix;
  return out;
}

export function getValue(segment, payload, now) {
  if (!segment || !segment.source) return null;
  const at = now === undefined ? Date.now() : now;
  let raw = null;

  try {
    if (segment.source.kind === 'literal') {
      raw = segment.source.value;
    } else if (segment.source.kind === 'derived') {
      const fn = DERIVED[segment.source.fn];
      raw = fn ? fn(payload, at) : null;
    } else {
      raw = getPath(payload, segment.source.path);
    }
  } catch {
    return null;
  }

  if (raw === null || raw === undefined) return null;
  if (segment.hideValues && segment.hideValues.indexOf(String(raw)) !== -1) return null;

  const display = applyFormat(raw, segment.format, at);
  if (display === null) return null;

  let colorValue = Number(raw);
  if (!Number.isFinite(colorValue)) {
    const scale = segment.scaleMap;
    colorValue = scale && scale[String(raw)] !== undefined ? scale[String(raw)] : null;
  }
  return { raw, display, colorValue };
}

const seg = (id, group, label, emoji, source, format, color, extra) => ({
  id, group, label, emoji, source, format,
  color: color || TEXT,
  showLabel: false,
  showEmoji: true,
  line: 0,
  hideWhen: 'empty',
  ...(extra || {})
});
const path = p => ({ kind: 'path', path: p });
const derived = fn => ({ kind: 'derived', fn });

export const CATALOG = [
  // session
  seg('session_name', 'session', 'session', '🏷️', path('session_name'), { type: 'text', max: 24 }, ACCENT),
  seg('session_id', 'session', 'id', '🆔', path('session_id'), { type: 'text', slice: 8 }, MUTED),
  seg('permission_mode', 'session', 'mode', '🛡️', path('permission_mode'), { type: 'text' }, MUTED, { hideValues: ['default'] }),
  seg('output_style', 'session', 'style', '🎨', path('output_style.name'), { type: 'text' }, MUTED, { hideValues: ['default'] }),
  seg('remote', 'session', 'remote', '🛰️', path('remote.session_id'), { type: 'text', slice: 8 }, MUTED),

  // model
  seg('model', 'model', 'model', '🦄', path('model.display_name'), { type: 'text' }, ACCENT),
  seg('model_id', 'model', 'id', '🔖', path('model.id'), { type: 'text' }, MUTED),
  seg('effort', 'model', 'effort', '🎚️', path('effort.level'), { type: 'text' }, USAGE, { scaleMap: EFFORT_SCALE }),
  seg('fast_mode', 'model', 'fast', '⚡', path('fast_mode'), { type: 'bool', onLabel: 'fast' }, plain('#e0c46c')),
  seg('thinking', 'model', 'think', '💭', path('thinking.enabled'), { type: 'bool', onLabel: 'think' }, MUTED),
  seg('version', 'model', 'version', '🏷', path('version'), { type: 'text', prefix: 'v' }, MUTED),

  // workspace
  seg('project_dir', 'workspace', 'project', '📁', path('workspace.project_dir'), { type: 'path', mode: 'basename' }, BLUE),
  seg('current_dir', 'workspace', 'dir', '📂', path('workspace.current_dir'), { type: 'path', mode: 'basename' }, TEXT),
  seg('git_worktree', 'workspace', 'branch', '🌿', path('workspace.git_worktree'), { type: 'text', max: 28 }, GREEN),
  seg('repo', 'workspace', 'repo', '📦', path('workspace.repo'), { type: 'text' }, TEXT),
  seg('worktree_name', 'workspace', 'worktree', '🌳', path('worktree.name'), { type: 'text' }, GREEN),
  seg('worktree_branch', 'workspace', 'wt-branch', '🌿', path('worktree.branch'), { type: 'text' }, GREEN),
  seg('added_dirs', 'workspace', 'added', '➕', path('workspace.added_dirs'), { type: 'count', prefix: '+' }, MUTED),
  seg('pr', 'workspace', 'pr', '🔀', path('pr.number'), { type: 'raw', prefix: '#' }, BLUE),

  // context
  seg('ctx_used', 'context', 'ctx', '🧠', path('context_window.used_percentage'), { type: 'percent', decimals: 0 }, USAGE),
  seg('ctx_remaining', 'context', 'left', '🧠', path('context_window.remaining_percentage'), { type: 'percent', decimals: 0 }, INVERSE),
  seg('ctx_left_tokens', 'context', 'left', '🧠', derived('contextLeftTokens'), { type: 'number' }, MUTED),
  seg('ctx_window_size', 'context', 'window', '🪟', path('context_window.context_window_size'), { type: 'number' }, MUTED),
  seg('tokens_in', 'context', 'in', '↑', path('context_window.total_input_tokens'), { type: 'number' }, MUTED, { showEmoji: true }),
  seg('tokens_out', 'context', 'out', '↓', path('context_window.total_output_tokens'), { type: 'number' }, MUTED),
  seg('tokens_cache_read', 'context', 'cache', '♻️', path('context_window.current_usage.cache_read_input_tokens'), { type: 'number' }, MUTED),
  seg('exceeds_200k', 'context', 'big', '📈', path('exceeds_200k_tokens'), { type: 'bool', onLabel: '200k+' }, plain('#e0c46c')),

  // limits
  seg('limit_5h', 'limits', '5h', '🔥', path('rate_limits.five_hour.used_percentage'), { type: 'percent', decimals: 0 }, USAGE),
  seg('limit_5h_reset', 'limits', '5h reset', '⏳', path('rate_limits.five_hour.resets_at'), { type: 'countdown' }, MUTED),
  seg('limit_7d', 'limits', '7d', '🎯', path('rate_limits.seven_day.used_percentage'), { type: 'percent', decimals: 0 }, USAGE),
  seg('limit_7d_reset', 'limits', '7d reset', '📅', path('rate_limits.seven_day.resets_at'), { type: 'countdown' }, MUTED),

  // cost
  seg('cost_usd', 'cost', 'cost', '💰', path('cost.total_cost_usd'), { type: 'currency' }, plain('#e0c46c')),
  seg('duration', 'cost', 'time', '⏲️', path('cost.total_duration_ms'), { type: 'duration' }, MUTED),
  seg('api_duration', 'cost', 'api', '🛜', path('cost.total_api_duration_ms'), { type: 'duration' }, MUTED),
  seg('lines_added', 'cost', 'added', '➕', path('cost.total_lines_added'), { type: 'number', prefix: '+' }, GREEN),
  seg('lines_removed', 'cost', 'removed', '➖', path('cost.total_lines_removed'), { type: 'number', prefix: '-' }, RED),
  seg('lines_delta', 'cost', 'lines', '📝', derived('linesDelta'), { type: 'raw' }, GREEN),

  // derived
  seg('weekly_today_left', 'derived', 'today', '📆', derived('todayLeft'), { type: 'percent', decimals: 0, suffix: 't' }, INVERSE),
  seg('weekly_pace', 'derived', 'pace', '🏃', derived('pace'), { type: 'percent', decimals: 0, suffix: '/d' }, INVERSE),
  seg('weekly_even_burn', 'derived', 'burn', '', derived('evenBurn'), { type: 'arrow', decimals: 0 }, BURN, { showEmoji: false }),
  seg('mood', 'derived', 'mood', '', derived('mood'), { type: 'emojiScale', stops: MOOD_STOPS }, MUTED, { showEmoji: false }),

  // status
  seg('vim_mode', 'status', 'vim', '⌨️', path('vim.mode'), { type: 'text' }, MUTED),
  seg('agent_name', 'status', 'agent', '🕵️', path('agent.name'), { type: 'text' }, MUTED),
  seg('agent_type', 'status', 'type', '🧩', path('agent_type'), { type: 'text' }, MUTED, { hideValues: ['main'] })
];

export const CATALOG_BY_ID = CATALOG.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

// Free-text blocks. They are not part of the catalogue — the user creates them —
// but they behave like any other segment, so they can be dragged between the
// real ones to act as group dividers.
export const BLOCK_GROUP = 'block';

export function isBlock(segment) {
  return Boolean(segment && segment.source && segment.source.kind === 'literal');
}

export function makeBlock(id, text) {
  return {
    id,
    group: BLOCK_GROUP,
    label: 'Block',
    emoji: '',
    source: { kind: 'literal', value: text === undefined ? '┃' : text },
    format: { type: 'raw' },
    color: { mode: 'static', value: '#8a90a0' },
    showLabel: false,
    showEmoji: false,
    line: 0,
    hideWhen: 'empty'
  };
}

export function nextBlockId(segments) {
  let n = 1;
  const taken = new Set((segments || []).map(s => s.id));
  while (taken.has('block_' + n)) n += 1;
  return 'block_' + n;
}

// The layout from the reference screenshot, used by the "reference" sort option
// and as the default configuration.
export const REFERENCE_ORDER = [
  'model', 'effort', 'limit_7d', 'weekly_today_left', 'weekly_pace', 'weekly_even_burn',
  'ctx_used', 'lines_delta', 'limit_5h', 'limit_5h_reset', 'mood'
];
