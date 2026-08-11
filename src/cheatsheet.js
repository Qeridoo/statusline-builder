// Builds the annotated cheat sheet: the rendered status line with a labelled
// callout per segment, as a standalone SVG.
//
// Text measurement is injected rather than done here, so the layout is a pure
// function the tests can drive with a predictable monospace model while the
// browser passes a real canvas measurer.

import { buildLines } from './render.js';
import { helpText } from './catalog.js';
import { tt, lang } from './i18n.js';

export const REPO_URL = 'github.com/Qeridoo/statusline-builder';

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = s => String(s).replace(/[&<>"']/g, c => XML_ESCAPES[c]);

export const THEME = {
  bg: '#14131a',
  panel: '#1b1a23',
  ink: '#e7e4f0',
  muted: '#8b869c',
  faint: '#3a3747',
  accent: '#a882ff',
  separator: '#5d5a71'
};

const LAYOUT = {
  pad: 44,
  titleSize: 19,
  lineSize: 17,
  calloutTitleSize: 9.5,
  calloutBodySize: 9.5,
  calloutLineHeight: 12,
  rowGap: 14,
  leader: 16,
  labelWrap: 30,
  minGap: 16
};

export function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// Alternates callouts above and below the line, then packs each side into as
// few rows as fit without two labels overlapping.
export function assignSlots(callouts, minGap = LAYOUT.minGap) {
  const ordered = callouts.slice().sort((a, b) => a.anchor - b.anchor);
  const sides = { top: [], bottom: [] };
  ordered.forEach((callout, index) => {
    callout.side = index % 2 === 0 ? 'top' : 'bottom';
    sides[callout.side].push(callout);
  });

  for (const side of ['top', 'bottom']) {
    const rightmost = [];
    for (const callout of sides[side]) {
      const left = callout.anchor - callout.width / 2;
      let row = 0;
      while (rightmost[row] !== undefined && rightmost[row] + minGap > left) row += 1;
      rightmost[row] = left + callout.width;
      callout.row = row;
      callout.left = left;
    }
  }

  return {
    callouts: ordered,
    topRows: sides.top.reduce((max, c) => Math.max(max, c.row + 1), 0),
    bottomRows: sides.bottom.reduce((max, c) => Math.max(max, c.row + 1), 0)
  };
}

// Everything positional, separated from the markup so the geometry can be
// asserted directly — in particular that no callout runs off the canvas.
// measure(text, fontSize, family) -> width in px. family is 'mono' or 'sans'.
export function cheatsheetGeometry(config, payload, measure, opts = {}) {
  const now = opts.now === undefined ? Date.now() : opts.now;
  const lines = buildLines(config, payload, now);

  const mono = text => measure(text, LAYOUT.lineSize, 'mono');
  const sansTitle = text => measure(text, LAYOUT.calloutTitleSize, 'sans');
  const sansBody = text => measure(text, LAYOUT.calloutBodySize, 'sans');

  // Lay out every status line row, remembering where each segment sits.
  const rendered = lines.map(entry => {
    const separator = separatorOf(config, entry.line);
    const separatorWidth = mono(separator);
    const parts = [];
    let x = 0;
    entry.parts.forEach((part, index) => {
      if (index > 0) {
        parts.push({ text: separator, x, width: separatorWidth, hex: THEME.separator, isSeparator: true });
        x += separatorWidth;
      }
      const width = mono(part.text);
      parts.push({ text: part.text, x, width, hex: part.hex || THEME.ink, segment: part.segment });
      x += width;
    });
    return { parts, width: x };
  });

  const lineWidth = rendered.reduce((max, row) => Math.max(max, row.width), 0);

  // Only the first row gets callouts; a second status line would double the
  // height for little gain, and its segments are listed in the legend anyway.
  const primary = rendered[0] || { parts: [], width: 0 };
  const callouts = primary.parts
    .filter(part => part.segment && helpText(part.segment, lang()))
    .map(part => {
      const label = String(part.segment.label || part.segment.id).toUpperCase();
      const body = wrapText(helpText(part.segment, lang()), LAYOUT.labelWrap);
      const width = Math.max(sansTitle(label), ...body.map(sansBody), 40);
      return { label, body, width, anchor: part.x + part.width / 2, hex: part.hex };
    });

  const slots = assignSlots(callouts);
  const bodyLines = Math.max(1, ...callouts.map(c => c.body.length));
  const blockHeight = LAYOUT.calloutLineHeight * (bodyLines + 1) + LAYOUT.rowGap;

  const topBlock = slots.topRows * blockHeight;
  const bottomBlock = slots.bottomRows * blockHeight;
  const headerH = LAYOUT.titleSize + 26;
  const statusRowHeight = LAYOUT.lineSize * 1.75;
  const statusH = rendered.length * statusRowHeight;
  const footerH = 30;

  // A callout is centred on its segment, so the outermost ones stick out past
  // the status line itself. The canvas has to cover them, not just the line.
  const contentLeft = Math.min(0, ...callouts.map(c => c.anchor - c.width / 2));
  const contentRight = Math.max(lineWidth, ...callouts.map(c => c.anchor + c.width / 2));
  const contentWidth = contentRight - contentLeft;

  const width = Math.round(Math.max(940, contentWidth + LAYOUT.pad * 2));
  const height = Math.round(LAYOUT.pad + headerH + topBlock + LAYOUT.leader + statusH +
    LAYOUT.leader + bottomBlock + footerH + LAYOUT.pad);

  const originX = Math.round((width - contentWidth) / 2 - contentLeft);
  const firstBaseline = LAYOUT.pad + headerH + topBlock + LAYOUT.leader + LAYOUT.lineSize;

  return {
    rendered, callouts: slots.callouts, width, height, originX, firstBaseline,
    blockHeight, topBlock, headerH, statusRowHeight, bodyLines,
    topRows: slots.topRows, bottomRows: slots.bottomRows
  };
}

export function buildCheatsheetSvg(config, payload, measure, opts = {}) {
  const title = opts.title || tt('cheat.title');
  const repo = opts.repo || REPO_URL;
  const {
    rendered, callouts, width, height, originX, firstBaseline,
    blockHeight, topBlock, headerH, statusRowHeight
  } = cheatsheetGeometry(config, payload, measure, opts);

  const out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" font-family="ui-sans-serif, Segoe UI, Helvetica, Arial, sans-serif">');
  out.push('<rect width="100%" height="100%" fill="' + THEME.bg + '"/>');
  out.push('<rect x="16" y="16" width="' + (width - 32) + '" height="' + (height - 32) +
    '" rx="14" fill="' + THEME.panel + '" stroke="' + THEME.faint + '"/>');

  out.push('<text x="' + LAYOUT.pad + '" y="' + (LAYOUT.pad + LAYOUT.titleSize) + '" font-size="' + LAYOUT.titleSize +
    '" font-weight="600" fill="' + THEME.ink + '">' + escapeXml(title) + '</text>');

  // Status line rows.
  rendered.forEach((row, index) => {
    const baseline = firstBaseline + index * statusRowHeight;
    out.push('<g font-family="ui-monospace, Cascadia Code, Consolas, monospace" font-size="' + LAYOUT.lineSize + '">');
    for (const part of row.parts) {
      out.push('<text x="' + round(originX + part.x) + '" y="' + round(baseline) + '" fill="' + part.hex +
        '" xml:space="preserve">' + escapeXml(part.text) + '</text>');
    }
    out.push('</g>');
  });

  // Callouts.
  const lastBaseline = firstBaseline + (rendered.length - 1) * statusRowHeight;
  for (const callout of callouts) {
    const anchorX = round(originX + callout.anchor);
    const isTop = callout.side === 'top';
    const rowOffset = callout.row * blockHeight;

    const labelBottom = isTop
      ? LAYOUT.pad + headerH + topBlock - rowOffset - LAYOUT.rowGap
      : lastBaseline + LAYOUT.leader + rowOffset + LAYOUT.calloutLineHeight;

    const leaderFrom = isTop
      ? labelBottom + 4
      : lastBaseline + 6;
    const leaderTo = isTop
      ? firstBaseline - LAYOUT.lineSize - 4
      : labelBottom - LAYOUT.calloutLineHeight - 4;

    out.push('<line x1="' + anchorX + '" y1="' + round(leaderFrom) + '" x2="' + anchorX + '" y2="' +
      round(leaderTo) + '" stroke="' + THEME.faint + '" stroke-width="1"/>');

    const titleY = isTop ? labelBottom - LAYOUT.calloutLineHeight * callout.body.length : labelBottom;
    out.push('<text x="' + anchorX + '" y="' + round(titleY) + '" text-anchor="middle" font-size="' +
      LAYOUT.calloutTitleSize + '" font-weight="700" letter-spacing="0.9" fill="' + (callout.hex || THEME.ink) +
      '">' + escapeXml(callout.label) + '</text>');

    callout.body.forEach((text, index) => {
      const y = titleY + LAYOUT.calloutLineHeight * (index + 1);
      out.push('<text x="' + anchorX + '" y="' + round(y) + '" text-anchor="middle" font-size="' +
        LAYOUT.calloutBodySize + '" fill="' + THEME.muted + '">' + escapeXml(text) + '</text>');
    });
  }

  out.push('<text x="' + LAYOUT.pad + '" y="' + round(height - LAYOUT.pad) + '" font-size="11" fill="' + THEME.muted +
    '" font-family="ui-monospace, Cascadia Code, Consolas, monospace">' + escapeXml(repo) + '</text>');
  out.push('</svg>');
  return out.join('\n');
}

function separatorOf(config, index) {
  const perLine = config.separators;
  if (Array.isArray(perLine) && typeof perLine[index] === 'string') return perLine[index];
  return config.separator === undefined ? ' | ' : config.separator;
}

const round = n => Math.round(n * 10) / 10;
