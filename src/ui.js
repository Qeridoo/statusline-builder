// Catalogue, builder rows, and the wiring that ties everything to state.

import {
  CATALOG, CATALOG_BY_ID, GROUPS, REFERENCE_ORDER,
  USAGE, INVERSE, MOOD_STOPS, isBlock, makeBlock, nextBlockId
} from './catalog.js';
import { getState, patch, commit, subscribe } from './state.js';
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
    { label: 'Ordnername', patch: { mode: 'basename' } },
    { label: 'Letzte 2 Ebenen', patch: { mode: 'last2' } },
    { label: 'Voller Pfad', patch: { mode: 'full' } },
    { label: 'Home als ~', patch: { mode: 'tilde' } }
  ],
  percent: [
    { label: 'ganzzahlig', patch: { decimals: 0 } },
    { label: '1 Nachkomma', patch: { decimals: 1 } }
  ],
  number: [
    { label: 'gekürzt 95k', patch: { abbrev: true } },
    { label: 'voll 95000', patch: { abbrev: false } }
  ],
  text: [
    { label: 'voll', patch: { max: 0, slice: 0 } },
    { label: 'max 12', patch: { max: 12, slice: 0 } },
    { label: 'max 24', patch: { max: 24, slice: 0 } },
    { label: 'erste 8', patch: { max: 0, slice: 8 } }
  ],
  bool: [
    { label: 'nur wenn an', patch: { hideWhenFalse: true } },
    { label: 'immer zeigen', patch: { hideWhenFalse: false, offLabel: 'off' } }
  ],
  arrow: [
    { label: '▼▲ ganzzahlig', patch: { decimals: 0 } },
    { label: '▼▲ 1 Nachkomma', patch: { decimals: 1 } }
  ],
  emojiScale: [
    { label: 'Katzen', patch: { stops: MOOD_STOPS } },
    { label: 'Ampel', patch: { stops: [[0, '🟢'], [50, '🟡'], [75, '🟠'], [90, '🔴']] } },
    { label: 'Wetter', patch: { stops: [[0, '☀️'], [40, '⛅'], [65, '🌧️'], [85, '⛈️']] } },
    { label: 'Akku', patch: { stops: [[0, '🔋'], [50, '🪫']] } }
  ],
  countdown: [{ label: 'Restzeit', patch: {} }],
  duration: [{ label: 'Dauer', patch: {} }],
  currency: [{ label: 'USD', patch: {} }],
  count: [{ label: 'Anzahl', patch: {} }],
  raw: [{ label: 'unverändert', patch: {} }]
};

const COLOR_CHOICES = [
  { id: 'default', label: 'Standard' },
  { id: 'usage', label: 'Ampel grün→rot' },
  { id: 'inverse', label: 'Ampel invers' },
  { id: 'static', label: 'Einfarbig' },
  { id: 'gradient', label: 'Verlauf' }
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
    installPath: document.getElementById('install-path'),
    installCommand: document.getElementById('install-command'),
    verifyCommand: document.getElementById('verify-command'),
    shellName: document.getElementById('shell-name'),
    copyScript: document.getElementById('copy-script'),
    copyCommand: document.getElementById('copy-command'),
    osButtons: Array.from(document.querySelectorAll('.os')),
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
    renderSeparators(dom);
    renderCatalog(dom, rebuild);
    renderRows(dom, rebuild);
    refresh();
  };

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
      el('span', { text: state.lineCount > 1 ? 'Trenner Zeile ' + (index + 1) : 'Trenner' }),
      el('input', {
        type: 'text',
        list: 'sep-presets',
        value: state.separators[index],
        'aria-label': 'Trenner für Zeile ' + (index + 1),
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
      list.appendChild(el('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(on),
        title: segment.source.kind === 'derived'
          ? 'berechnet: ' + segment.source.fn
          : segment.source.path,
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
      ]));
    }

    dom.catalog.appendChild(el('div', { class: 'group' }, [
      el('div', { class: 'group__head' }, [
        el('span', { text: group.emoji }),
        el('span', { text: group.label })
      ]),
      list
    ]));
  }
}

function renderRows(dom, rebuild) {
  const state = getState();
  dom.rows.replaceChildren();

  if (!state.segments.length) {
    dom.rows.appendChild(el('p', { class: 'empty', text: 'Noch nichts ausgewählt — links Segmente antippen.' }));
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
      'aria-label': 'Farbe für ' + segment.id,
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
          placeholder: 'Blocktext',
          'aria-label': 'Text des Blocks',
          oninput: event => {
            segment.source = { kind: 'literal', value: event.target.value };
            commit();
          }
        })
      : (choices.length > 1
          ? select(
              choices.map((choice, i) => ({ value: String(i), label: choice.label })),
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
      placeholder: block ? '—' : (catalogueLabel || 'Label'),
      'aria-label': 'Label für ' + segment.id,
      oninput: event => {
        const text = event.target.value;
        segment.showLabel = text.length > 0;
        segment.label = text || catalogueLabel;
        commit();
      }
    });
    if (block) labelInput.disabled = true;

    const row = el('div', { class: 'row', draggable: 'true' }, [
      el('span', { class: 'row__grip', text: '⠿', 'aria-hidden': 'true' }),

      el('div', { class: 'row__name' }, [
        el('span', { class: 'row__id', text: segment.id, title: segment.id }),
        el('span', { class: 'row__group', text: block ? 'Block' : segment.group })
      ]),

      el('input', {
        class: 'row__emoji',
        type: 'text',
        maxlength: '4',
        value: segment.emoji || '',
        placeholder: '–',
        'aria-label': 'Emoji für ' + segment.id,
        oninput: event => {
          segment.emoji = event.target.value;
          segment.showEmoji = event.target.value.length > 0;
          commit();
        }
      }),

      contentCell,

      select(
        COLOR_CHOICES.map(choice => ({ value: choice.id, label: choice.label })),
        colorId,
        value => {
          segment.color = colorFor(value, segment);
          swatch.hidden = value !== 'static';
          if (value === 'static') swatch.value = segment.color.value;
          commit();
        }
      ),

      select(
        Array.from({ length: state.lineCount }, (_, i) => ({ value: String(i), label: 'Zeile ' + (i + 1) })),
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
          class: 'icon-btn', type: 'button', title: 'nach oben',
          onclick: () => move(index, index - 1)
        }, [el('span', { text: '↑' })]),
        el('button', {
          class: 'icon-btn', type: 'button', title: 'nach unten',
          onclick: () => move(index, index + 1)
        }, [el('span', { text: '↓' })]),
        el('button', {
          class: 'icon-btn icon-btn--danger', type: 'button', title: 'entfernen',
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
