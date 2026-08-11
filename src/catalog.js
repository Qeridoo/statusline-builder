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

// One sentence per segment, saying what the number means rather than where it
// comes from. Shown as a tooltip in the builder and as the caption on the
// cheatsheet, so it has to stay short enough to wrap into two narrow lines.
export const HELP = {
  session_name: 'Name der Session, wie mit /rename vergeben. Ohne Namen bleibt das Segment leer.',
  session_id: 'Die ersten 8 Zeichen der Session-UUID — nützlich, um Transcripts wiederzufinden.',
  permission_mode: 'Aktueller Berechtigungsmodus. Wird ausgeblendet, solange er auf default steht.',
  output_style: 'Gewählter Output-Style. Wird ausgeblendet, solange er auf default steht.',
  remote: 'Kennung der Remote-Session, wenn die Arbeit in der Cloud läuft.',

  model: 'Das Modell, das gerade antwortet.',
  model_id: 'Die vollständige Modell-ID inklusive Varianten-Suffix wie [1m].',
  effort: 'Reasoning-Effort von low bis max. Höher heißt gründlicher und langsamer.',
  fast_mode: 'Zeigt an, dass Fast Mode aktiv ist — gleiches Modell, schnellere Ausgabe.',
  thinking: 'Zeigt an, dass erweitertes Nachdenken eingeschaltet ist.',
  version: 'Version von Claude Code.',

  project_dir: 'Das Projektverzeichnis, in dem die Session gestartet wurde.',
  current_dir: 'Das Verzeichnis, in dem gerade gearbeitet wird — kann vom Projekt abweichen.',
  git_worktree: 'Der ausgecheckte Git-Branch des Arbeitsverzeichnisses.',
  repo: 'Name des Git-Repositories.',
  worktree_name: 'Name des isolierten Worktrees, wenn mit --worktree gearbeitet wird.',
  worktree_branch: 'Branch innerhalb des isolierten Worktrees.',
  added_dirs: 'Anzahl zusätzlich freigegebener Verzeichnisse außerhalb des Projekts.',
  pr: 'Nummer des Pull Requests, an dem diese Session hängt.',

  ctx_used: 'Wie voll das Kontextfenster dieses Chats ist. Setzt sich mit /clear zurück.',
  ctx_remaining: 'Wie viel vom Kontextfenster noch frei ist — Gegenstück zu ctx.',
  ctx_left_tokens: 'Verbleibender Kontext in Tokens statt in Prozent.',
  ctx_window_size: 'Gesamtgröße des Kontextfensters dieses Modells.',
  tokens_in: 'Summe aller Eingabe-Tokens dieser Session, inklusive Cache.',
  tokens_out: 'Summe aller Ausgabe-Tokens dieser Session.',
  tokens_cache_read: 'Aus dem Prompt-Cache gelesene Tokens — die sind deutlich billiger.',
  exceeds_200k: 'Meldet, dass die Session über 200k Tokens hinaus ist.',

  limit_5h: 'Verbrauch im laufenden 5-Stunden-Fenster. Kommt vom Server, wie /usage.',
  limit_5h_reset: 'Countdown bis das 5-Stunden-Fenster zurückgesetzt wird.',
  limit_7d: 'Verbrauch im laufenden Wochenfenster. Kommt vom Server, wie /usage.',
  limit_7d_reset: 'Countdown bis das Wochenfenster zurückgesetzt wird.',

  cost_usd: 'Bisherige Kosten dieser Session in US-Dollar.',
  duration: 'Wanduhr-Zeit seit Beginn der Session.',
  api_duration: 'Reine API-Zeit — der Anteil, in dem tatsächlich gerechnet wurde.',
  lines_added: 'In dieser Session hinzugefügte Codezeilen.',
  lines_removed: 'In dieser Session entfernte Codezeilen.',
  lines_delta: 'Hinzugefügte und entfernte Zeilen dieser Session in einem Segment.',

  weekly_today_left: 'Wie viel vom heutigen Anteil am Wochenlimit noch übrig ist. 0 heißt: für heute aufgebraucht, negativ heißt: du greifst auf morgen vor.',
  weekly_pace: 'Wie viel Prozent pro Tag du ab jetzt verbrauchen darfst, um das Wochenlimit gerade zu erreichen.',
  weekly_even_burn: 'Abstand zur gleichmäßigen Verbrauchslinie. ▼ heißt unter Plan, ▲ heißt du bist vor dem Reset am Limit.',
  mood: 'Fasst den schlechtesten der drei Messwerte — Kontext, 5h, 7d — in einem Emoji zusammen.',

  vim_mode: 'Aktueller Vim-Modus, wenn die Vim-Eingabe eingeschaltet ist.',
  agent_name: 'Name des Subagenten, der diese Zeile rendert.',
  agent_type: 'Typ des Agenten. Wird ausgeblendet, solange es der Hauptagent ist.'
};

export const HELP_EN = {
  session_name: 'Name of the session, as set with /rename. Without one the segment stays empty.',
  session_id: 'The first 8 characters of the session UUID — handy for finding transcripts.',
  permission_mode: 'The current permission mode. Hidden while it sits at default.',
  output_style: 'The chosen output style. Hidden while it sits at default.',
  remote: 'Identifier of the remote session when the work runs in the cloud.',

  model: 'The model that is answering right now.',
  model_id: 'The full model id including variant suffixes such as [1m].',
  effort: 'Reasoning effort from low to max. Higher means more thorough and slower.',
  fast_mode: 'Shows that fast mode is on — same model, faster output.',
  thinking: 'Shows that extended thinking is switched on.',
  version: 'The version of Claude Code.',

  project_dir: 'The project directory the session was started in.',
  current_dir: 'The directory being worked in, which can differ from the project.',
  git_worktree: 'The git branch checked out in the working directory.',
  repo: 'Name of the git repository.',
  worktree_name: 'Name of the isolated worktree when running with --worktree.',
  worktree_branch: 'Branch inside the isolated worktree.',
  added_dirs: 'How many extra directories outside the project were made available.',
  pr: 'Number of the pull request this session is attached to.',

  ctx_used: 'How full this chat’s context window is. Resets with /clear.',
  ctx_remaining: 'How much of the context window is still free — the counterpart to ctx.',
  ctx_left_tokens: 'Remaining context in tokens rather than per cent.',
  ctx_window_size: 'Total size of this model’s context window.',
  tokens_in: 'All input tokens of this session, cache included.',
  tokens_out: 'All output tokens of this session.',
  tokens_cache_read: 'Tokens served from the prompt cache — those are far cheaper.',
  exceeds_200k: 'Flags that the session has passed 200k tokens.',

  limit_5h: 'Usage inside the running 5-hour window. Server-side, same as /usage.',
  limit_5h_reset: 'Countdown until the 5-hour window resets.',
  limit_7d: 'Usage inside the running weekly window. Server-side, same as /usage.',
  limit_7d_reset: 'Countdown until the weekly window resets.',

  cost_usd: 'What this session has cost so far, in US dollars.',
  duration: 'Wall-clock time since the session started.',
  api_duration: 'API time only — the share actually spent computing.',
  lines_added: 'Lines of code added in this session.',
  lines_removed: 'Lines of code removed in this session.',
  lines_delta: 'Lines added and removed in this session, in one segment.',

  weekly_today_left: 'How much of today’s share of the weekly limit is left. 0 means done for today, negative means you are eating into tomorrow.',
  weekly_pace: 'How many per cent per day you may spend from now on to just reach the weekly limit.',
  weekly_even_burn: 'Distance from an even burn line. ▼ means under plan, ▲ means you will cap before the reset.',
  mood: 'Folds the worst of the three meters — context, 5h, 7d — into a single emoji.',

  vim_mode: 'The current vim mode when vim input is switched on.',
  agent_name: 'Name of the subagent rendering this line.',
  agent_type: 'Type of agent. Hidden while it is the main one.'
};

for (const segment of CATALOG) {
  segment.help = { de: HELP[segment.id] || '', en: HELP_EN[segment.id] || '' };
}

export function helpText(segment, lang) {
  const help = segment && segment.help;
  if (!help) return '';
  if (typeof help === 'string') return help;
  return help[lang] || help.en || help.de || '';
}

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
