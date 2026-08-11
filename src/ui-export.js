// Preview rendering, the export panel, and reading an existing status line back in.

import { renderHtml } from './render.js';
import { getState, patch, toConfig } from './state.js';
import { todayLeft, pace, evenBurn } from './derive.js';
import {
  generateScript, generatePrompt, generateConfigJson, parseAnyConfig,
  generateSettingsSnippet, writeToFileCommand, verifyCommand,
  SHELL_NAMES, INSTALL_PATHS
} from './generate.js';
import { buildCheatsheetSvg } from './cheatsheet.js';
import { tt, lang } from './i18n.js';

const HOUR = 3600 * 1000;

const MONO_STACK = 'ui-monospace, "Cascadia Code", Consolas, monospace';
const SANS_STACK = 'ui-sans-serif, "Segoe UI", Helvetica, Arial, sans-serif';

// Canvas gives the same advances the SVG renderer will use, including the
// double-width emoji. Without a canvas we fall back to a terminal-cell estimate.
export function makeMeasurer() {
  let context = null;
  try {
    const canvas = document.createElement('canvas');
    context = canvas.getContext ? canvas.getContext('2d') : null;
  } catch {
    context = null;
  }

  return (text, size, family) => {
    if (context) {
      context.font = size + 'px ' + (family === 'mono' ? MONO_STACK : SANS_STACK);
      return context.measureText(String(text)).width;
    }
    const chars = Array.from(String(text));
    if (family === 'mono') {
      return chars.reduce((n, c) => n + (c.codePointAt(0) > 0x2000 ? 2 : 1), 0) * size * 0.6;
    }
    return chars.length * size * 0.55;
  };
}

export function cheatsheetSvg() {
  return buildCheatsheetSvg(toConfig(), previewPayload(), makeMeasurer(), { now: Date.now() });
}

// Rasterises through an <img>, which the browser renders with local fonts. The
// SVG has no external references, so nothing can be blocked here.
export function svgToPngBlob(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth * scale;
        canvas.height = image.naturalHeight * scale;
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error(tt('err.pngBlob')))), 'image/png');
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(tt('err.pngRender')));
    };
    image.src = url;
  });
}

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
    [tt('readout.today'), todayLeft(payload, now), '%'],
    [tt('readout.pace'), pace(payload, now), '%/d'],
    [tt('readout.burn'), evenBurn(payload, now), '']
  ]
    .filter(([, v]) => v !== null)
    .map(([label, v, unit]) => label + ' ' + v.toFixed(0) + unit);
  readoutEl.textContent = bits.join('  ·  ');
}

const hintFor = tab => tt('hint.' + tab);

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

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function download(tab, text) {
  // text/plain makes browsers append .txt to a .js filename; octet-stream keeps
  // the name from the download attribute intact.
  downloadBlob(new Blob([text], { type: 'application/octet-stream' }), FILENAMES[tab] || 'statusline.txt');
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

  button.textContent = ok ? tt('action.copied') : tt('action.copyFailed');
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
let lastHintLang = null;

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
      dom.hint.textContent = tt('download.sandboxed');
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
    dom.hint.textContent = tt('load.done', { segments: config.segments.length, lines: config.lineCount });
  });

  if (dom.loadFile) {
    dom.loadFile.addEventListener('change', () => {
      const file = dom.loadFile.files && dom.loadFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        dom.out.value = String(reader.result || '');
        if (dom.loadFileName) dom.loadFileName.textContent = file.name;
        dom.hint.textContent = tt('load.fileRead');
      };
      reader.onerror = () => { dom.hint.textContent = tt('load.fileFailed'); };
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

  if (dom.cheatSvg) {
    dom.cheatSvg.addEventListener('click', () =>
      downloadBlob(new Blob([cheatsheetSvg()], { type: 'image/svg+xml;charset=utf-8' }), 'statusline-cheatsheet.svg'));
  }

  if (dom.cheatCopy) {
    dom.cheatCopy.addEventListener('click', () => copyText(cheatsheetSvg(), dom.cheatCopy, null));
  }

  if (dom.cheatPng) {
    dom.cheatPng.addEventListener('click', () => {
      const button = dom.cheatPng;
      const label = button.dataset.label || button.textContent;
      button.dataset.label = label;
      button.textContent = tt('action.rendering');
      svgToPngBlob(cheatsheetSvg())
        .then(blob => {
          downloadBlob(blob, 'statusline-cheatsheet.png');
          button.textContent = label;
        })
        .catch(error => {
          button.textContent = label;
          dom.hint.textContent = tt('cheat.pngFailed', { message: error.message });
        });
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

  const isCheat = tab === 'cheat';
  dom.out.hidden = isCheat;
  if (dom.cheatPanel) dom.cheatPanel.hidden = !isCheat;

  if (isCheat) {
    if (dom.cheatPreview) dom.cheatPreview.innerHTML = cheatsheetSvg();
  } else if (tab === 'load') {
    // Only clear on arrival, so a paste survives the re-render that follows it.
    if (tabChanged) {
      dom.out.value = '';
      if (dom.loadFileName) dom.loadFileName.textContent = '';
    }
    dom.out.readOnly = false;
    dom.out.placeholder = tt('load.placeholder');
  } else {
    // Export views are read-only, so there is never a user edit to protect —
    // always rewrite them, otherwise they go stale after an import.
    dom.out.value = exportText(tab);
    dom.out.readOnly = true;
    dom.out.placeholder = '';
  }

  // The cheat sheet and the load view bring their own buttons.
  dom.import.hidden = tab !== 'load';
  dom.download.hidden = tab === 'load' || isCheat;
  dom.copy.hidden = tab === 'load' || isCheat;
  if (dom.loadControls) dom.loadControls.hidden = tab !== 'load';
  // The hint also has to follow a language switch, not just a tab change.
  const currentLang = lang();
  if (tabChanged || lastHintLang !== currentLang) dom.hint.textContent = hintFor(tab);
  lastHintLang = currentLang;

  dom.osButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.os === os));
  });

  if (document.activeElement !== dom.installPath) dom.installPath.value = installPath;
  dom.snippet.value = generateSettingsSnippet(installPath, os);
  if (dom.installCommand) dom.installCommand.value = writeToFileCommand(os, installPath);
  if (dom.verifyCommand) dom.verifyCommand.value = verifyCommand(os, installPath);
  if (dom.shellName) dom.shellName.textContent = SHELL_NAMES[os] || 'Terminal';
}
