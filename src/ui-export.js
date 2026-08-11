// Preview rendering and the export panel.

import { renderHtml } from './render.js';
import { getState, patch, toConfig } from './state.js';
import { todayLeft, pace, evenBurn } from './derive.js';
import {
  generateScript, generatePrompt, generateConfigJson,
  parseConfigJson, generateSettingsSnippet
} from './generate.js';

const HOUR = 3600 * 1000;

// SAMPLE_PAYLOAD is injected by build.js from sample-payload.json.
export function previewPayload() {
  const { preview } = getState();
  const now = Date.now();
  const base = JSON.parse(JSON.stringify(SAMPLE_PAYLOAD));

  base.context_window.used_percentage = preview.ctx;
  base.context_window.remaining_percentage = 100 - preview.ctx;
  base.rate_limits.five_hour.used_percentage = preview.fiveHour;
  base.rate_limits.seven_day.used_percentage = preview.sevenDay;

  // The fixture's timestamps are fixed, which would render every countdown as
  // "now". Anchor them to the current clock so the preview stays meaningful.
  base.rate_limits.five_hour.resets_at = Math.round((now + 4.9 * HOUR) / 1000);
  base.rate_limits.seven_day.resets_at = Math.round((now + 4.2 * 24 * HOUR) / 1000);
  return base;
}

export function renderPreview(el, readoutEl) {
  const payload = previewPayload();
  el.innerHTML = renderHtml(toConfig(), payload, Date.now());

  const now = Date.now();
  const bits = [
    ['heute übrig', todayLeft(payload, now), '%'],
    ['Tempo', pace(payload, now), '%/d'],
    ['vs. Even-Burn', evenBurn(payload, now), '']
  ]
    .filter(([, v]) => v !== null)
    .map(([label, v, unit]) => label + ' ' + v.toFixed(0) + unit);
  readoutEl.textContent = bits.join('  ·  ');
}

const HINTS = {
  script: 'Datei speichern und in settings.json darauf zeigen. Läuft mit purem Node, ohne jq.',
  prompt: 'An Claude geben — enthält Segmentliste, Regeln und die fertige Config.',
  config: 'Sichern oder in einer anderen Session wieder einlesen: einfügen und übernehmen.'
};

export function exportText(tab) {
  const config = toConfig();
  if (tab === 'prompt') return generatePrompt(config, { installPath: getState().installPath });
  if (tab === 'config') return generateConfigJson(config);
  return generateScript(config);
}

const FILENAMES = { script: 'statusline.js', prompt: 'statusline-prompt.md', config: 'statusline-config.json' };

export function download(tab, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILENAMES[tab] || 'statusline.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyText(text, button) {
  const original = button.textContent;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = false;
  }
  button.textContent = ok ? 'Kopiert' : 'Bitte manuell markieren';
  setTimeout(() => { button.textContent = original; }, 1600);
}

export function importConfig(text) {
  const config = parseConfigJson(text);
  patch({
    segments: config.segments,
    separator: config.separator,
    dimSeparator: config.dimSeparator,
    lineCount: config.lineCount,
    sort: 'manual'
  });
}

export function mountExport(dom) {
  const setTab = tab => {
    patch({ tab });
  };

  dom.tabs.forEach(button => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  dom.copy.addEventListener('click', () => copyText(dom.out.value, dom.copy));
  dom.download.addEventListener('click', () => download(getState().tab, dom.out.value));

  dom.import.addEventListener('click', () => {
    try {
      importConfig(dom.out.value);
      dom.hint.textContent = 'Config übernommen.';
    } catch (error) {
      dom.hint.textContent = 'Config nicht lesbar: ' + error.message;
    }
  });

  dom.installPath.addEventListener('input', () => patch({ installPath: dom.installPath.value }));
}

export function renderExport(dom) {
  const { tab, installPath } = getState();

  dom.tabs.forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  });

  // Leave the box alone while the user is pasting into it on the config tab.
  if (document.activeElement !== dom.out) dom.out.value = exportText(tab);
  dom.out.readOnly = tab !== 'config';
  dom.import.hidden = tab !== 'config';
  dom.hint.textContent = HINTS[tab];

  if (document.activeElement !== dom.installPath) dom.installPath.value = installPath;
  dom.snippet.value = generateSettingsSnippet(installPath);
}
