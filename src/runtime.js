// The engine that ships inside the generated statusline.js.
//
// It deliberately repeats the logic of format.js, derive.js, color.js and
// render.js instead of importing them: the generated file lives in ~/.claude and
// must stand alone. test/generate.test.js renders the same config through both
// paths and asserts byte equality, so the two cannot drift apart unnoticed.
//
// Constraints for anything written inside this string: no backticks and no
// dollar-brace sequences, because the whole body is a raw template literal.

export const RUNTIME_SOURCE = String.raw`
'use strict';

const ESC = String.fromCharCode(27);
const WINDOW_MS = 7 * 24 * 3600 * 1000;
// SL_NOW makes the output reproducible for tests.
const NOW = Number(process.env.SL_NOW) || Date.now();

function parseResetsAt(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^\d+$/.test(trimmed)) return parseResetsAt(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function fmtPercent(n, opts) {
  const f = opts || {};
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const decimals = f.decimals || 0;
  const prefix = f.sign && v > 0 ? '+' : '';
  return prefix + v.toFixed(decimals) + '%';
}

function fmtNumber(n, opts) {
  const f = opts || {};
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (f.abbrev === false) return String(Math.round(v));
  const abs = Math.abs(v);
  const divisor = abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  const suffix = abs >= 1e6 ? 'M' : abs >= 1e3 ? 'k' : '';
  const scaled = v / divisor;
  const decimals = suffix && Math.abs(scaled) < 10 ? 1 : 0;
  return scaled.toFixed(decimals) + suffix;
}

function fmtDuration(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return null;
  const totalMinutes = Math.floor(v / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return days + 'd' + hours + 'h';
  if (hours > 0) return hours + 'h' + String(minutes).padStart(2, '0') + 'm';
  return minutes + 'm';
}

function fmtCountdown(resetsAtMs, nowMs) {
  const target = Number(resetsAtMs);
  const now = Number(nowMs);
  if (!Number.isFinite(target) || !Number.isFinite(now)) return null;
  return target - now <= 0 ? 'now' : fmtDuration(target - now);
}

function fmtCurrency(usd) {
  const v = Number(usd);
  return Number.isFinite(v) ? '$' + v.toFixed(2) : null;
}

function fmtPath(p, opts) {
  const f = opts || {};
  if (typeof p !== 'string' || p === '') return null;
  const mode = f.mode || 'basename';
  if (mode === 'full') return p;
  const normalised = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (mode === 'tilde') return normalised.replace(/^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+/, '~');
  const parts = normalised.split('/').filter(Boolean);
  if (!parts.length) return normalised;
  if (mode === 'last2') return parts.slice(-2).join('/');
  return parts[parts.length - 1];
}

function fmtText(s, opts) {
  const f = opts || {};
  if (s === null || s === undefined) return null;
  const str = String(s);
  const max = Number(f.max) || 0;
  if (!max || str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function fmtBool(v, opts) {
  const f = opts || {};
  if (v === null || v === undefined) return null;
  const hideWhenFalse = f.hideWhenFalse === undefined ? true : f.hideWhenFalse;
  if (!v) return hideWhenFalse ? null : (f.offLabel || '');
  return f.onLabel || 'on';
}

function weeklyWindow(payload) {
  const bucket = payload && payload.rate_limits && payload.rate_limits.seven_day;
  if (!bucket) return null;
  const resetsAt = parseResetsAt(bucket.resets_at);
  const used = Number(bucket.used_percentage);
  if (resetsAt === null || !Number.isFinite(used)) return null;
  const start = resetsAt - WINDOW_MS;
  const elapsedFraction = Math.min(1, Math.max(0, (NOW - start) / WINDOW_MS));
  const daysLeft = Math.max((resetsAt - NOW) / 86400000, 1 / 24);
  return { used: used, resetsAt: resetsAt, elapsedFraction: elapsedFraction, daysLeft: daysLeft };
}

function worstMeter(payload) {
  const out = [];
  const push = v => { const n = Number(v); if (Number.isFinite(n)) out.push(n); };
  push(payload && payload.context_window && payload.context_window.used_percentage);
  push(payload && payload.rate_limits && payload.rate_limits.five_hour && payload.rate_limits.five_hour.used_percentage);
  push(payload && payload.rate_limits && payload.rate_limits.seven_day && payload.rate_limits.seven_day.used_percentage);
  return out.length ? Math.max.apply(null, out) : null;
}

function derivedValue(fn, payload) {
  if (fn === 'evenBurn') {
    const w = weeklyWindow(payload);
    return w ? w.used - w.elapsedFraction * 100 : null;
  }
  if (fn === 'pace') {
    const w = weeklyWindow(payload);
    return w ? (100 - w.used) / w.daysLeft : null;
  }
  if (fn === 'todayLeft') {
    const w = weeklyWindow(payload);
    if (!w) return null;
    const slice = 100 / 7;
    const dayIndex = Math.floor(w.elapsedFraction * 7);
    const usedToday = w.used - dayIndex * slice;
    return Math.min(100, ((slice - usedToday) / slice) * 100);
  }
  if (fn === 'mood') return worstMeter(payload);
  if (fn === 'linesDelta') {
    const added = Number(payload && payload.cost && payload.cost.total_lines_added);
    const removed = Number(payload && payload.cost && payload.cost.total_lines_removed);
    if (!Number.isFinite(added) && !Number.isFinite(removed)) return null;
    return '+' + (Number.isFinite(added) ? added : 0) + '/-' + (Number.isFinite(removed) ? removed : 0);
  }
  if (fn === 'contextLeftTokens') {
    const size = Number(payload && payload.context_window && payload.context_window.context_window_size);
    const pct = Number(payload && payload.context_window && payload.context_window.remaining_percentage);
    if (!Number.isFinite(size) || !Number.isFinite(pct)) return null;
    return (size * pct) / 100;
  }
  return null;
}

function getPath(obj, path) {
  if (!obj || !path) return null;
  let cur = obj;
  const keys = path.split('.');
  for (let i = 0; i < keys.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = cur[keys[i]];
  }
  return cur === undefined ? null : cur;
}

const MOOD_STOPS = [[0, '\u{1F63A}'], [30, '\u{1F63C}'], [50, '\u{1F640}'], [70, '\u{1F63E}']];

function applyFormat(raw, format) {
  const f = format || {};
  const type = f.type || 'text';
  let out = null;

  if (type === 'raw') {
    out = raw === null || raw === undefined ? null : String(raw);
  } else if (type === 'path') {
    out = fmtPath(raw, { mode: f.mode || 'basename' });
  } else if (type === 'percent') {
    out = fmtPercent(raw, f);
  } else if (type === 'number') {
    out = fmtNumber(raw, f);
  } else if (type === 'duration') {
    out = fmtDuration(raw);
  } else if (type === 'countdown') {
    out = fmtCountdown(parseResetsAt(raw), NOW);
  } else if (type === 'currency') {
    out = fmtCurrency(raw);
  } else if (type === 'bool') {
    out = fmtBool(raw, f);
  } else if (type === 'count') {
    const n = Array.isArray(raw) ? raw.length : Number(raw);
    out = Number.isFinite(n) && n > 0 ? String(n) : null;
  } else if (type === 'arrow') {
    const v = Number(raw);
    if (Number.isFinite(v)) {
      const arrow = v < -0.5 ? '▼' : v > 0.5 ? '▲' : '▬';
      out = arrow + Math.abs(v).toFixed(f.decimals || 0);
    }
  } else if (type === 'emojiScale') {
    const v = Number(raw);
    if (Number.isFinite(v)) {
      const stops = (f.stops || MOOD_STOPS).slice().sort((a, b) => a[0] - b[0]);
      out = stops[0][1];
      for (let i = 0; i < stops.length; i++) if (v >= stops[i][0]) out = stops[i][1];
    }
  } else {
    let s = raw === null || raw === undefined ? null : String(raw);
    if (s !== null && f.slice) s = s.slice(0, f.slice);
    out = s === null ? null : fmtText(s, { max: f.max });
  }

  if (out === null || out === undefined || out === '') return null;
  if (f.prefix) out = f.prefix + out;
  if (f.suffix) out = out + f.suffix;
  return out;
}

function getValue(segment, payload) {
  if (!segment || !segment.source) return null;
  let raw = null;
  try {
    if (segment.source.kind === 'literal') raw = segment.source.value;
    else if (segment.source.kind === 'derived') raw = derivedValue(segment.source.fn, payload);
    else raw = getPath(payload, segment.source.path);
  } catch (e) {
    return null;
  }
  if (raw === null || raw === undefined) return null;
  if (segment.hideValues && segment.hideValues.indexOf(String(raw)) !== -1) return null;

  const display = applyFormat(raw, segment.format);
  if (display === null) return null;

  let colorValue = Number(raw);
  if (!Number.isFinite(colorValue)) {
    const scale = segment.scaleMap;
    colorValue = scale && scale[String(raw)] !== undefined ? scale[String(raw)] : null;
  }
  return { raw: raw, display: display, colorValue: colorValue };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex === null || hex === undefined ? '' : hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  const channel = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + rgb.map(channel).join('');
}

function resolveColor(spec, value) {
  if (!spec || typeof spec !== 'object') return null;
  if (spec.mode === 'static') return spec.value || null;
  const v = Number(value);
  if (spec.mode === 'threshold') {
    const stops = (spec.stops || []).slice().sort((a, b) => a[0] - b[0]);
    if (!stops.length) return null;
    if (!Number.isFinite(v)) return stops[0][1];
    let picked = stops[0][1];
    for (let i = 0; i < stops.length; i++) if (v >= stops[i][0]) picked = stops[i][1];
    return picked;
  }
  if (spec.mode === 'gradient') {
    const from = hexToRgb(spec.from);
    const to = hexToRgb(spec.to);
    if (!from || !to) return null;
    const min = Number(spec.min === undefined ? 0 : spec.min);
    const max = Number(spec.max === undefined ? 100 : spec.max);
    const t = max === min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
    return rgbToHex(from.map((c, i) => c + (to[i] - c) * t));
  }
  return null;
}

function hexToAnsi(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? '38;2;' + rgb.join(';') : null;
}

function ansiWrap(text, hex, opts) {
  const o = opts || {};
  const codes = [];
  if (o.bold) codes.push('1');
  if (o.dim) codes.push('2');
  const colour = hexToAnsi(hex);
  if (colour) codes.push(colour);
  if (!codes.length) return text;
  return ESC + '[' + codes.join(';') + 'm' + text + ESC + '[0m';
}

function safeHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex)) ? String(hex) : null;
}

function segmentText(segment, value) {
  const pieces = [];
  if (segment.showEmoji !== false && segment.emoji) pieces.push(segment.emoji);
  if (segment.showLabel && segment.label) pieces.push(segment.label + ':');
  pieces.push(value.display);
  return pieces.join(' ');
}

function separatorFor(index) {
  const perLine = CFG.separators;
  if (Array.isArray(perLine) && typeof perLine[index] === 'string') return perLine[index];
  return CFG.separator === undefined ? ' | ' : CFG.separator;
}

function render(payload) {
  const lineCount = Math.max(1, Math.min(3, Number(CFG.lineCount) || 1));
  const lines = [];
  for (let i = 0; i < lineCount; i++) lines.push({ line: i, parts: [] });

  const segments = CFG.segments || [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const value = getValue(segment, payload);
    if (!value) continue;
    const index = Math.min(lineCount - 1, Math.max(0, Number(segment.line) || 0));
    lines[index].parts.push({
      segment: segment,
      text: segmentText(segment, value),
      hex: safeHex(resolveColor(segment.color, value.colorValue))
    });
  }

  return lines
    .filter(entry => entry.parts.length > 0)
    .map(entry => {
      const joiner = ansiWrap(separatorFor(entry.line), null, { dim: CFG.dimSeparator !== false });
      return entry.parts
        .map(p => ansiWrap(p.text, p.hex, { bold: p.segment.bold, dim: p.segment.dim }))
        .join(joiner);
    })
    .join('\n');
}

function fallback(payload) {
  const model = getPath(payload, 'model.display_name');
  const dir = fmtPath(getPath(payload, 'workspace.current_dir') || getPath(payload, 'cwd'), { mode: 'basename' });
  return [model, dir].filter(Boolean).join(' | ');
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}') || {};
  } catch (e) {
    payload = {};
  }
  let out;
  try {
    out = render(payload);
  } catch (e) {
    try { out = fallback(payload); } catch (e2) { out = ''; }
  }
  process.stdout.write(out + '\n');
});
`;
