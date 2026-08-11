// Preview rendering, the export panel, and reading an existing status line back in.

import { renderHtml } from './render.js';
import { getState, patch, toConfig } from './state.js';
import { todayLeft, pace, evenBurn } from './derive.js';
import {
  generateScript, generatePrompt, generateConfigJson, parseAnyConfig,
  generateSettingsSnippet, writeToFileCommand, verifyCommand,
  SHELL_NAMES, INSTALL_PATHS
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
  script: 'Das ist die Datei, die installiert wird. Unten Schritt für Schritt.',
  prompt: 'An Claude geben — enthält Segmentliste, Regeln und die fertige Config.',
  config: 'Nur eine Sicherung der Einstellungen — NICHT die Datei, die installiert wird. Zum Zurückladen den Tab „Laden" nehmen.',
  load: 'Bestehendes statusline.js oder eine Config einfügen bzw. Datei wählen, dann Übernehmen.'
};

const LOAD_PLACEHOLDER =
  'Hier ein erzeugtes statusline.js einfügen (der CFG-Block wird ausgelesen) oder eine Config-JSON.\n' +
  'Alternativ oben eine Datei wählen — z. B. ~/.claude/statusline.js';

export function exportText(tab) {
  const config = toConfig();
  if (tab === 'prompt') return generatePrompt(config, { installPath: getState().installPath });
  if (tab === 'config') return generateConfigJson(config);
  return generateScript(config);
}

const FILENAMES = {
  script: 'statusline.js',
  prompt: 'statusline-prompt.md',
  config: 'statusline-config.json'
};

export function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function download(tab, text) {
  // text/plain makes browsers append .txt to a .js filename; octet-stream keeps
  // the name from the download attribute intact.
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILENAMES[tab] || 'statusline.txt';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function copyText(text, button, node) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  const original = button.dataset.label;

  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = false;
  }
  if (!ok && node) {
    // Clipboard API needs a permission the artifact sandbox may withhold.
    try {
      node.focus();
      node.select();
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
  }

  button.textContent = ok ? 'Kopiert' : 'Bitte manuell kopieren';
  setTimeout(() => { button.textContent = original; }, 1800);
}

export function importConfig(text) {
  const config = parseAnyConfig(text);
  patch({
    segments: config.segments,
    separator: config.separator,
    separators: config.separators,
    dimSeparator: config.dimSeparator,
    lineCount: config.lineCount,
    sort: 'manual'
  });
  return config;
}

let lastTab = null;

export function mountExport(dom, rebuild) {
  dom.tabs.forEach(button => {
    button.addEventListener('click', () => patch({ tab: button.dataset.tab }));
  });

  dom.copy.addEventListener('click', () => copyText(dom.out.value, dom.copy, dom.out));

  dom.download.addEventListener('click', () => {
    download(getState().tab, dom.out.value);
    if (inIframe()) {
      // Nothing in the page can lift a sandbox download block, so fall straight
      // through to the path that always works: select the text for copying.
      try {
        dom.out.focus();
        dom.out.select();
      } catch {
        // Selecting is a convenience; ignore browsers that refuse it.
      }
      dom.hint.textContent =
        'Kommt kein Download an, blockiert ihn die Sandbox. Nimm die vier Schritte unten — ' +
        'die brauchen keinen Download.';
    }
  });

  dom.import.addEventListener('click', () => {
    let config;
    try {
      config = importConfig(dom.out.value);
    } catch (error) {
      dom.hint.textContent = error.message;
      return;
    }
    patch({ tab: 'script' });
    rebuild();
    dom.hint.textContent = 'Übernommen — ' + config.segments.length +
      ' Segmente, ' + config.lineCount + (config.lineCount === 1 ? ' Zeile.' : ' Zeilen.');
  });

  if (dom.loadFile) {
    dom.loadFile.addEventListener('change', () => {
      const file = dom.loadFile.files && dom.loadFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        dom.out.value = String(reader.result || '');
        if (dom.loadFileName) dom.loadFileName.textContent = file.name;
        dom.hint.textContent = 'Datei gelesen. Jetzt „Übernehmen" drücken.';
      };
      reader.onerror = () => { dom.hint.textContent = 'Datei konnte nicht gelesen werden.'; };
      reader.readAsText(file);
    });
  }

  // Always the script, never whatever tab happens to be open — copying the
  // Config tab by mistake produces a file Node cannot run.
  if (dom.copyScript) {
    dom.copyScript.addEventListener('click', () =>
      copyText(exportText('script'), dom.copyScript, null));
  }

  if (dom.copyCommand) {
    dom.copyCommand.addEventListener('click', () => {
      const { os, installPath } = getState();
      copyText(writeToFileCommand(os, installPath), dom.copyCommand, dom.installCommand);
    });
  }

  dom.osButtons.forEach(button => {
    button.addEventListener('click', () => {
      const os = button.dataset.os;
      // Switching platform swaps in that platform's conventional path.
      patch({ os, installPath: INSTALL_PATHS[os] });
    });
  });

  dom.installPath.addEventListener('input', () => patch({ installPath: dom.installPath.value }));
}

export function renderExport(dom) {
  const { tab, installPath, os } = getState();
  const tabChanged = tab !== lastTab;
  lastTab = tab;

  dom.tabs.forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  });

  if (tab === 'load') {
    // Only clear on arrival, so a paste survives the re-render that follows it.
    if (tabChanged) {
      dom.out.value = '';
      if (dom.loadFileName) dom.loadFileName.textContent = '';
    }
    dom.out.readOnly = false;
    dom.out.placeholder = LOAD_PLACEHOLDER;
  } else {
    // Export views are read-only, so there is never a user edit to protect —
    // always rewrite them, otherwise they go stale after an import.
    dom.out.value = exportText(tab);
    dom.out.readOnly = true;
    dom.out.placeholder = '';
  }

  dom.import.hidden = tab !== 'load';
  dom.download.hidden = tab === 'load';
  dom.copy.hidden = tab === 'load';
  if (dom.loadControls) dom.loadControls.hidden = tab !== 'load';
  if (tabChanged) dom.hint.textContent = HINTS[tab];

  dom.osButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.os === os));
  });

  if (document.activeElement !== dom.installPath) dom.installPath.value = installPath;
  dom.snippet.value = generateSettingsSnippet(installPath, os);
  if (dom.installCommand) dom.installCommand.value = writeToFileCommand(os, installPath);
  if (dom.verifyCommand) dom.verifyCommand.value = verifyCommand(os, installPath);
  if (dom.shellName) dom.shellName.textContent = SHELL_NAMES[os] || 'Terminal';
}
