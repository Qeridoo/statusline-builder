// Turns a config plus a payload into either terminal output or preview markup.
// Both renderers share buildLines so the preview cannot drift from the real thing.

import { getValue } from './catalog.js';
import { resolveColor, ansiWrap } from './color.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => HTML_ESCAPES[c]);

// Config can arrive from an imported JSON file, so a colour is only ever
// interpolated into markup after it has been checked.
const safeHex = hex => (/^#[0-9a-f]{6}$/i.test(String(hex)) ? String(hex) : null);

export const DEFAULT_SEPARATOR = ' | ';

// Each line carries its own separator; config.separator is the fallback for
// lines that were never given one, and for configs written before per-line
// separators existed.
export function separatorFor(config, index) {
  const perLine = config.separators;
  if (Array.isArray(perLine) && typeof perLine[index] === 'string') return perLine[index];
  return config.separator === undefined ? DEFAULT_SEPARATOR : config.separator;
}

export function segmentText(segment, value) {
  const pieces = [];
  if (segment.showEmoji !== false && segment.emoji) pieces.push(segment.emoji);
  if (segment.showLabel && segment.label) pieces.push(segment.label + ':');
  pieces.push(value.display);
  return pieces.join(' ');
}

// Returns one entry per non-empty line, keeping the original line index so the
// caller can look up that line's separator.
export function buildLines(config, payload, now) {
  const lineCount = Math.max(1, Math.min(3, Number(config.lineCount) || 1));
  const lines = [];
  for (let i = 0; i < lineCount; i++) lines.push({ line: i, parts: [] });

  for (const segment of config.segments || []) {
    const value = getValue(segment, payload, now);
    if (!value) continue;
    const index = Math.min(lineCount - 1, Math.max(0, Number(segment.line) || 0));
    lines[index].parts.push({
      segment,
      value,
      text: segmentText(segment, value),
      hex: safeHex(resolveColor(segment.color, value.colorValue))
    });
  }
  return lines.filter(entry => entry.parts.length > 0);
}

export function renderAnsi(config, payload, now) {
  const at = now === undefined ? Date.now() : now;
  return buildLines(config, payload, at)
    .map(entry => {
      const joiner = ansiWrap(separatorFor(config, entry.line), null, { dim: config.dimSeparator !== false });
      return entry.parts
        .map(p => ansiWrap(p.text, p.hex, { bold: p.segment.bold, dim: p.segment.dim }))
        .join(joiner);
    })
    .join('\n');
}

export function renderHtml(config, payload, now) {
  const at = now === undefined ? Date.now() : now;
  return buildLines(config, payload, at)
    .map(entry => {
      const joiner = '<span class="sl-sep">' +
        escapeHtml(separatorFor(config, entry.line)).replace(/ /g, '&nbsp;') + '</span>';
      return entry.parts
        .map(p => {
          const styles = [];
          if (p.hex) styles.push('color:' + p.hex);
          if (p.segment.bold) styles.push('font-weight:700');
          if (p.segment.dim) styles.push('opacity:.6');
          const attr = styles.length ? ' style="' + styles.join(';') + '"' : '';
          return '<span class="sl-seg"' + attr + '>' + escapeHtml(p.text) + '</span>';
        })
        .join(joiner);
    })
    .join('<br>');
}
