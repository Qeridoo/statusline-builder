// Catalogue, builder rows, and the wiring that ties everything to state.

import {
  CATALOG, CATALOG_BY_ID, GROUPS, REFERENCE_ORDER,
  USAGE, INVERSE, MOOD_STOPS, isBlock, makeBlock, nextBlockId, helpText
} from './catalog.js';
import { getState, patch, commit, subscribe, setLanguage } from './state.js';
import { tt, lang, LANGS } from './i18n.js';
import { renderPreview, renderExport, mountExport } from './ui-export.js';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
};

const FORMAT_CHOICES = {
  path: [
    { key: 'fmt.basename', patch: { mode: 'basename' } },
    { key: 'fmt.last2', patch: { mode: 'last2' } },
    { key: 'fmt.full', patch: { mode: 'full' } },
    { key: 'fmt.tilde', patch: { mode: 'tilde' } }
  ],
  percent: [
    { key: 'fmt.int', patch: { decimals: 0 } },
    { key: 'fmt.decimal1', patch: { decimals: 1 } }
  ],
  number: [
    { key: 'fmt.short', patch: { abbrev: true } },
    { key: 'fmt.long', patch: { abbrev: false } }
  ],
  text: [
    { key: 'fmt.textFull', patch: { max: 0, slice: 0 } },
    { key: 'fmt.max12', patch: { max: 12, slice: 0 } },
    { key: 'fmt.max24', patch: { max: 24, slice: 0 } },
    { key: 'fmt.first8', patch: { max: 0, slice: 8 } }
  ],
  bool: [
    { key: 'fmt.onlyOn', patch: { hideWhenFalse: true } },
    { key: 'fmt.always', patch: { hideWhenFalse: false, offLabel: 'off' } }
  ],
  arrow: [
    { key: 'fmt.arrowInt', patch: { decimals: 0 } },
    { key: 'fmt.arrowDecimal', patch: { decimals: 1 } }
  ],
  emojiScale: [
    { key: 'fmt.cats', patch: { stops: MOOD_STOPS } },
    { key: 'fmt.traffic', patch: { stops: [[0, '🟢'], [50, '🟡'], [75, '🟠'], [90, '🔴']] } },
    { key: 'fmt.weather', patch: { stops: [[0, '☀️'], [40, '⛅'], [65, '🌧️'], [85, '⛈️']] } },
    { key: 'fmt.battery', patch: { stops: [[0, '🔋'], [50, '🪫']] } }
  ],
  countdown: [{ key: 'fmt.countdown', patch: {} }],
  duration: [{ key: 'fmt.duration', patch: {} }],
  currency: [{ key: 'fmt.currency', patch: {} }],
  count: [{ key: 'fmt.count', patch: {} }],
  raw: [{ key: 'fmt.raw', patch: {} }]
};

const COLOR_CHOICES = [
  { id: 'default', key: 'color.default' },
  { id: 'usage', key: 'color.usage' },
  { id: 'inverse', key: 'color.inverse' },
  { id: 'static', key: 'color.static' },
  { id: 'gradient', key: 'color.gradient' }
];

const GRADIENT = { mode: 'gradient', from: '#7ec699', to: '#e06c75', min: 0, max: 100 };

function sameValue(a, b) {
  if (typeof a === 'number' || typeof b === 'number') return (Number(a) || 0) === (Number(b) || 0);
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (a && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a === undefined || a === null ? '' : a) === String(b === undefined || b === null ? '' : b);
}

function formatChoices(segment) {
  return FORMAT_CHOICES[(segment.format || {}).type || 'text'] || [];
}

function activeFormatChoice(segment) {
  const choices = formatChoices(segment);
  const index = choices.findIndex(choice =>
    Object.keys(choice.patch).every(key => sameValue((segment.format || {})[key], choice.patch[key])));
  return index === -1 ? 0 : index;
}

function activeColorChoice(segment) {
  const fallback = (CATALOG_BY_ID[segment.id] || {}).color;
  if (fallback && JSON.stringify(fallback) === JSON.stringify(segment.color)) return 'default';
  const color = segment.color || {};
  if (color.mode === 'gradient') return 'gradient';
  if (color.mode === 'static') return 'static';
  if (JSON.stringify(color.stops) === JSON.stringify(USAGE.stops)) return 'usage';
  if (JSON.stringify(color.stops) === JSON.stringify(INVERSE.stops)) return 'inverse';
  return 'default';
}

function colorFor(choiceId, segment) {
  if (choiceId === 'usage') return { ...USAGE };
  if (choiceId === 'inverse') return { ...INVERSE };
  if (choiceId === 'gradient') return { ...GRADIENT };
  if (choiceId === 'static') {
    const current = segment.color || {};
    return { mode: 'static', value: current.mode === 'static' ? current.value : '#c8ccd4' };
  }
  return { ...((CATALOG_BY_ID[segment.id] || {}).color || { mode: 'static', value: '#c8ccd4' }) };
}

const select = (options, selected, onChange) => {
  const node = el('select', { onchange: event => onChange(event.target.value) });
  for (const option of options) {
    node.appendChild(el('option', { value: option.value, text: option.label }));
  }
  node.value = selected;
  return node;
};

// ---- tooltips ----
//
// One shared node, positioned under whatever is hovered or focused. Native
// title attributes would do the job but arrive after a delay and cannot carry
// the source path on its own line.

let tipNode = null;

function tooltip() {
  if (!tipNode) {
    tipNode = el('div', { class: 'tip', role: 'tooltip' });
    tipNode.hidden = true;
    document.body.appendChild(tipNode);
  }
  return tipNode;
}

export function sourceLabel(segment) {
  if (!segment || !segment.source) return '';
  if (segment.source.kind === 'literal') return tt('tip.literal');
  if (segment.source.kind === 'derived') return tt('tip.derived', { fn: segment.source.fn });
  return segment.source.path;
}

function positionTip(node, target) {
  if (!target.getBoundingClientRect) return;
  const rect = target.getBoundingClientRect();
  const own = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
  const width = (own && own.width) || 260;
  const viewport = (typeof window !== 'undefined' && window.innerWidth) || 1200;
  node.style.left = Math.round(Math.max(10, Math.min(viewport - width - 10, rect.left))) + 'px';
  node.style.top = Math.round(rect.bottom + 8) + 'px';
}

function showTip(target, segment) {
  const help = helpText(segment, lang());
  const source = sourceLabel(segment);
  if (!help && !source) return;
  const node = tooltip();
  const children = [el('div', { class: 'tip__title', text: segment.label || segment.id })];
  if (help) children.push(el('div', { class: 'tip__body', text: help }));
  if (source) children.push(el('div', { class: 'tip__src', text: source }));
  node.replaceChildren(...children);
  node.hidden = false;
  positionTip(node, target);
}

function hideTip() {
  if (tipNode) tipNode.hidden = true;
}

function attachTip(target, segment) {
  target.addEventListener('mouseenter', () => showTip(target, segment));
  target.addEventListener('mouseleave', hideTip);
  target.addEventListener('focus', () => showTip(target, segment));
  target.addEventListener('blur', hideTip);
}

export function mount() {
  const dom = {
    preview: document.getElementById('preview'),
    readout: document.getElementById('derived-readout'),
    catalog: document.getElementById('catalog'),
    rows: document.getElementById('rows'),
    separators: document.getElementById('separators'),
    dimSeparator: document.getElementById('dim-separator'),
    lineCount: document.getElementById('line-count'),
    sort: document.getElementById('sort'),
    clearAll: document.getElementById('clear-all'),
    addBlock: document.getElementById('add-block'),
    tabs: Array.from(document.querySelectorAll('.tab')),
    out: document.getElementById('export-out'),
    copy: document.getElementById('copy'),
    download: document.getElementById('download'),
    import: document.getElementById('import'),
    hint: document.getElementById('export-hint'),
    loadControls: document.getElementById('load-controls'),
    loadFile: document.getElementById('load-file'),
    loadFileName: document.getElementById('load-file-name'),
    cheatPanel: document.getElementById('cheat-panel'),
    cheatPreview: document.getElementById('cheat-preview'),
    cheatPng: document.getElementById('cheat-png'),
    cheatSvg: document.getElementById('cheat-svg'),
    cheatCopy: document.getElementById('cheat-copy'),
    installPath: document.getElementById('install-path'),
    installCommand: document.getElementById('install-command'),
    verifyCommand: document.getElementById('verify-command'),
    shellName: document.getElementById('shell-name'),
    copyScript: document.getElementById('copy-script'),
    copyCommand: document.getElementById('copy-command'),
    osButtons: Array.from(document.querySelectorAll('.os')),
    langButtons: Array.from(document.querySelectorAll('.lang')),
    snippet: document.getElementById('settings-snippet'),
    sliders: [
      ['ctx', document.getElementById('pv-ctx'), document.getElementById('pv-ctx-out')],
      ['fiveHour', document.getElementById('pv-5h'), document.getElementById('pv-5h-out')],
      ['sevenDay', document.getElementById('pv-7d'), document.getElementById('pv-7d-out')]
    ]
  };

  const refresh = () => {
    renderPreview(dom.preview, dom.readout);
    renderExport(dom);
  };

  const rebuild = () => {
    applyStaticStrings(dom);
    renderSeparators(dom);
    renderCatalog(dom, rebuild);
    renderRows(dom, rebuild);
    refresh();
  };

  dom.langButtons.forEach(button => {
    button.addEventListener('click', () => {
      setLanguage(button.dataset.lang);
      hideTip();
      rebuild();
    });
  });

  dom.dimSeparator.addEventListener('change', () => patch({ dimSeparator: dom.dimSeparator.checked }));

  dom.lineCount.addEventListener('change', () => {
    patch({ lineCount: Number(dom.lineCount.value) });
    rebuild();
  });

  dom.sort.addEventListener('change', () => {
    applySort(dom.sort.value);
    rebuild();
  });

  dom.clearAll.addEventListener('click', () => {
    patch({ segments: [] });
    rebuild();
  });

  dom.addBlock.addEventListener('click', () => {
    const segments = getState().segments.slice();
    segments.push(makeBlock(nextBlockId(segments)));
    patch({ segments, sort: 'manual' });
    rebuild();
  });

  for (const [key, input, output] of dom.sliders) {
    input.addEventListener('input', () => {
      getState().preview[key] = Number(input.value);
      output.textContent = input.value + '%';
      commit();
    });
  }

  mountExport(dom, rebuild);
  subscribe(() => refresh());

  const state = getState();
  dom.dimSeparator.checked = state.dimSeparator;
  dom.lineCount.value = String(state.lineCount);
  dom.sort.value = state.sort;
  for (const [key, input, output] of dom.sliders) {
    input.value = String(state.preview[key]);
    output.textContent = state.preview[key] + '%';
  }

  rebuild();
}

// Swaps the strings that live in the template rather than in JavaScript. The
// markup is authored in English, so a failure here degrades to English rather
// than to empty labels.
function applyStaticStrings(dom) {
  const each = (selector, apply) => {
    const nodes = document.querySelectorAll ? document.querySelectorAll(selector) : [];
    for (const node of nodes) apply(node);
  };

  each('[data-i18n]', node => { node.textContent = tt(node.getAttribute('data-i18n')); });
  each('[data-i18n-html]', node => { node.innerHTML = tt(node.getAttribute('data-i18n-html')); });
  each('[data-i18n-aria]', node => { node.setAttribute('aria-label', tt(node.getAttribute('data-i18n-aria'))); });

  const current = lang();
  dom.langButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === current));
  });
  if (document.documentElement && document.documentElement.setAttribute) {
    document.documentElement.setAttribute('lang', current);
  }
}

function applySort(mode) {
  const state = getState();
  const segments = state.segments.slice();
  // Blocks are placed by hand, so they sort to the end rather than jumping to
  // the front on an unknown group.
  const groupRank = segment => {
    const index = GROUPS.map(g => g.id).indexOf(segment.group);
    return index === -1 ? GROUPS.length : index;
  };

  if (mode === 'alpha') {
    segments.sort((a, b) => a.id.localeCompare(b.id));
  } else if (mode === 'group') {
    segments.sort((a, b) => groupRank(a) - groupRank(b) || a.id.localeCompare(b.id));
  } else if (mode === 'reference') {
    const rank = id => {
      const index = REFERENCE_ORDER.indexOf(id);
      return index === -1 ? REFERENCE_ORDER.length : index;
    };
    segments.sort((a, b) => rank(a.id) - rank(b.id));
  }

  patch({ segments, sort: mode });
}

function renderSeparators(dom) {
  const state = getState();
  dom.separators.replaceChildren();

  for (let i = 0; i < state.lineCount; i++) {
    const index = i;
    dom.separators.appendChild(el('label', { class: 'sep-field' }, [
      el('span', {
        text: state.lineCount > 1
          ? tt('field.separatorLine', { n: index + 1 })
          : tt('field.separator')
      }),
      el('input', {
        type: 'text',
        list: 'sep-presets',
        value: state.separators[index],
        'aria-label': tt('field.separatorLine', { n: index + 1 }),
        oninput: event => {
          getState().separators[index] = event.target.value;
          if (index === 0) getState().separator = event.target.value;
          commit();
        }
      })
    ]));
  }
}

function renderCatalog(dom, rebuild) {
  const state = getState();
  const active = new Set(state.segments.map(s => s.id));
  dom.catalog.replaceChildren();

  for (const group of GROUPS) {
    const members = CATALOG.filter(s => s.group === group.id);
    if (!members.length) continue;

    const list = el('div', { class: 'group__list' });
    for (const segment of members) {
      const on = active.has(segment.id);
      const chip = el('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(on),
        'data-help': helpText(segment, lang()),
        onclick: () => {
          const current = getState();
          const next = active.has(segment.id)
            ? current.segments.filter(s => s.id !== segment.id)
            : current.segments.concat([{ ...segment }]);
          patch({ segments: next, sort: 'manual' });
          rebuild();
        }
      }, [
        segment.emoji ? el('span', { class: 'chip__emoji', text: segment.emoji }) : null,
        el('span', { text: segment.label })
      ]);
      attachTip(chip, segment);
      list.appendChild(chip);
    }

    dom.catalog.appendChild(el('div', { class: 'group' }, [
      el('div', { class: 'group__head' }, [
        el('span', { text: group.emoji }),
        el('span', { text: tt('group.' + group.id) })
      ]),
      list
    ]));
  }
}

function renderRows(dom, rebuild) {
  const state = getState();
  dom.rows.replaceChildren();

  if (!state.segments.length) {
    dom.rows.appendChild(el('p', { class: 'empty', text: tt('builder.empty') }));
    return;
  }

  const move = (from, to) => {
    const segments = getState().segments.slice();
    if (to < 0 || to >= segments.length) return;
    segments.splice(to, 0, segments.splice(from, 1)[0]);
    patch({ segments, sort: 'manual' });
    rebuild();
  };

  state.segments.forEach((segment, index) => {
    const block = isBlock(segment);
    const choices = formatChoices(segment);
    const colorId = activeColorChoice(segment);
    const catalogueLabel = (CATALOG_BY_ID[segment.id] || {}).label || '';

    const swatch = el('input', {
      class: 'row__swatch',
      type: 'color',
      value: (segment.color || {}).mode === 'static' ? (segment.color.value || '#c8ccd4') : '#c8ccd4',
      'aria-label': tt('row.colorAria', { id: segment.id }),
      oninput: event => {
        segment.color = { mode: 'static', value: event.target.value };
        commit();
      }
    });
    swatch.hidden = colorId !== 'static';

    // Blocks carry their own text; catalogue segments get a format dropdown.
    const contentCell = block
      ? el('input', {
          class: 'row__block',
          type: 'text',
          value: segment.source.value,
          placeholder: tt('row.blockPlaceholder'),
          'aria-label': tt('row.blockAria'),
          oninput: event => {
            segment.source = { kind: 'literal', value: event.target.value };
            commit();
          }
        })
      : (choices.length > 1
          ? select(
              choices.map((choice, i) => ({ value: String(i), label: tt(choice.key) })),
              String(activeFormatChoice(segment)),
              value => {
                segment.format = { ...segment.format, ...choices[Number(value)].patch };
                commit();
              }
            )
          : el('span', { class: 'row__group', text: (segment.format || {}).type || 'text' }));

    const labelInput = el('input', {
      class: 'row__label',
      type: 'text',
      maxlength: '18',
      value: segment.showLabel ? (segment.label || '') : '',
      placeholder: block ? '—' : (catalogueLabel || tt('row.labelPlaceholder')),
      'aria-label': tt('row.labelAria', { id: segment.id }),
      oninput: event => {
        const text = event.target.value;
        segment.showLabel = text.length > 0;
        segment.label = text || catalogueLabel;
        commit();
      }
    });
    if (block) labelInput.disabled = true;

    const name = el('div', {
      class: 'row__name',
      tabindex: '0',
      'data-help': helpText(segment, lang())
    }, [
      el('span', { class: 'row__id', text: segment.id }),
      el('span', { class: 'row__group', text: block ? tt('group.block') : tt('group.' + segment.group) })
    ]);
    attachTip(name, segment);

    const row = el('div', { class: 'row', draggable: 'true' }, [
      el('span', { class: 'row__grip', text: '⠿', 'aria-hidden': 'true' }),
      name,

      el('input', {
        class: 'row__emoji',
        type: 'text',
        maxlength: '4',
        value: segment.emoji || '',
        placeholder: '–',
        'aria-label': tt('row.emojiAria', { id: segment.id }),
        oninput: event => {
          segment.emoji = event.target.value;
          segment.showEmoji = event.target.value.length > 0;
          commit();
        }
      }),

      contentCell,

      select(
        COLOR_CHOICES.map(choice => ({ value: choice.id, label: tt(choice.key) })),
        colorId,
        value => {
          segment.color = colorFor(value, segment);
          swatch.hidden = value !== 'static';
          if (value === 'static') swatch.value = segment.color.value;
          commit();
        }
      ),

      select(
        Array.from({ length: state.lineCount }, (_, i) => ({ value: String(i), label: tt('row.line', { n: i + 1 }) })),
        String(Math.min(segment.line || 0, state.lineCount - 1)),
        value => {
          segment.line = Number(value);
          commit();
        }
      ),

      swatch,
      labelInput,

      el('div', { class: 'row__toggle' }, [
        el('button', {
          class: 'icon-btn', type: 'button', title: tt('row.up'),
          onclick: () => move(index, index - 1)
        }, [el('span', { text: '↑' })]),
        el('button', {
          class: 'icon-btn', type: 'button', title: tt('row.down'),
          onclick: () => move(index, index + 1)
        }, [el('span', { text: '↓' })]),
        el('button', {
          class: 'icon-btn icon-btn--danger', type: 'button', title: tt('row.remove'),
          onclick: () => {
            patch({ segments: getState().segments.filter((_, i) => i !== index), sort: 'manual' });
            rebuild();
          }
        }, [el('span', { text: '✕' })])
      ])
    ]);

    row.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('row--dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('row--dragging'));
    row.addEventListener('dragover', event => {
      event.preventDefault();
      row.classList.add('row--over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('row--over'));
    row.addEventListener('drop', event => {
      event.preventDefault();
      row.classList.remove('row--over');
      const from = Number(event.dataTransfer.getData('text/plain'));
      if (Number.isFinite(from) && from !== index) move(from, index);
    });

    dom.rows.appendChild(row);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
