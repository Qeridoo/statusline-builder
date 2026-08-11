// Value formatters shared by the builder preview and the generated status line.
// Every formatter returns null for input it cannot represent, so callers can
// drop the segment instead of printing a blank slot.

export function parseResetsAt(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Below 1e11 the value cannot plausibly be milliseconds since the epoch.
    return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^\d+$/.test(trimmed)) return parseResetsAt(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function fmtPercent(n, opts = {}) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const { decimals = 0, sign = false } = opts;
  const prefix = sign && v > 0 ? '+' : '';
  return prefix + v.toFixed(decimals) + '%';
}

export function fmtNumber(n, opts = {}) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (opts.abbrev === false) return String(Math.round(v));
  const abs = Math.abs(v);
  const [divisor, suffix] = abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'k'] : [1, ''];
  const scaled = v / divisor;
  const decimals = suffix && Math.abs(scaled) < 10 ? 1 : 0;
  return scaled.toFixed(decimals) + suffix;
}

export function fmtDuration(ms) {
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

// Takes milliseconds. Callers run parseResetsAt first.
export function fmtCountdown(resetsAtMs, nowMs) {
  const target = Number(resetsAtMs);
  const now = Number(nowMs);
  if (!Number.isFinite(target) || !Number.isFinite(now)) return null;
  return target - now <= 0 ? 'now' : fmtDuration(target - now);
}

export function fmtCurrency(usd) {
  const v = Number(usd);
  return Number.isFinite(v) ? '$' + v.toFixed(2) : null;
}

export function fmtPath(p, opts = {}) {
  if (typeof p !== 'string' || p === '') return null;
  const { mode = 'basename' } = opts;
  if (mode === 'full') return p;
  const normalised = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (mode === 'tilde') {
    return normalised.replace(/^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+/, '~');
  }
  const parts = normalised.split('/').filter(Boolean);
  if (!parts.length) return normalised;
  if (mode === 'last2') return parts.slice(-2).join('/');
  return parts[parts.length - 1];
}

export function fmtText(s, opts = {}) {
  if (s === null || s === undefined) return null;
  const str = String(s);
  const max = Number(opts.max) || 0;
  if (!max || str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export function fmtBool(v, opts = {}) {
  if (v === null || v === undefined) return null;
  const { onLabel = 'on', offLabel = '', hideWhenFalse = true } = opts;
  if (!v) return hideWhenFalse ? null : offLabel;
  return onLabel;
}
