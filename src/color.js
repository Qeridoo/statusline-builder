// Colour resolution and ANSI wrapping. Truecolor throughout — every terminal
// Claude Code runs in supports it.

const ESC = String.fromCharCode(27);

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex === null || hex === undefined ? '' : hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb) {
  const channel = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + rgb.map(channel).join('');
}

export function resolveColor(spec, value) {
  if (!spec || typeof spec !== 'object') return null;
  if (spec.mode === 'static') return spec.value || null;

  const v = Number(value);

  if (spec.mode === 'threshold') {
    const stops = (spec.stops || []).slice().sort((a, b) => a[0] - b[0]);
    if (!stops.length) return null;
    if (!Number.isFinite(v)) return stops[0][1];
    let picked = stops[0][1];
    for (const [at, hex] of stops) if (v >= at) picked = hex;
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

export function hexToAnsi(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? '38;2;' + rgb.join(';') : null;
}

export function ansiWrap(text, hex, opts = {}) {
  const codes = [];
  if (opts.bold) codes.push('1');
  if (opts.dim) codes.push('2');
  const colour = hexToAnsi(hex);
  if (colour) codes.push(colour);
  if (!codes.length) return text;
  return ESC + '[' + codes.join(';') + 'm' + text + ESC + '[0m';
}
