// Every user-facing string, in both languages. The catalogue keeps its own
// per-segment explanations; everything else lives here.

export const LANGS = ['de', 'en'];
export const DEFAULT_LANG = 'en';

export function detectLang() {
  try {
    const tags = [navigator.language].concat(navigator.languages || []);
    for (const tag of tags) {
      if (typeof tag === 'string' && tag.toLowerCase().startsWith('de')) return 'de';
    }
  } catch {
    // No navigator: fall through to the default.
  }
  return DEFAULT_LANG;
}

export const STRINGS = {
  de: {
    'app.subtitle': 'Claude Code · Payload-Schema 2.1.227',
    'field.lines': 'Zeilen',
    'field.dim': 'Trenner gedimmt',
    'field.separator': 'Trenner',
    'field.separatorLine': 'Trenner Zeile {n}',
    'field.sort': 'Sortierung',
    'sort.manual': 'manuell',
    'sort.reference': 'Referenz-Layout',
    'sort.group': 'nach Gruppe',
    'sort.alpha': 'alphabetisch',

    'panel.segments': 'Segmente',
    'panel.builder': 'Reihenfolge & Darstellung',
    'panel.export': 'Übergabe',
    'action.clearAll': 'alle aus',
    'action.addBlock': '+ Block',
    'builder.hint': 'Emoji und Label leer lassen heißt: wird nicht angezeigt. Ein Block ist freier Text, der immer erscheint — praktisch als Gruppentrenner.',
    'builder.empty': 'Noch nichts ausgewählt — links Segmente antippen.',
    'preview.empty': 'Kein Segment aktiv — links etwas auswählen.',
    'preview.aria': 'Vorschau der Statusline',

    'slider.context': 'Kontext',
    'readout.today': 'heute übrig',
    'readout.pace': 'Tempo',
    'readout.burn': 'vs. Even-Burn',

    'row.line': 'Zeile {n}',
    'row.labelPlaceholder': 'Label',
    'row.blockPlaceholder': 'Blocktext',
    'row.up': 'nach oben',
    'row.down': 'nach unten',
    'row.remove': 'entfernen',
    'row.emojiAria': 'Emoji für {id}',
    'row.labelAria': 'Label für {id}',
    'row.colorAria': 'Farbe für {id}',
    'row.blockAria': 'Text des Blocks',

    'fmt.basename': 'Ordnername',
    'fmt.last2': 'Letzte 2 Ebenen',
    'fmt.full': 'Voller Pfad',
    'fmt.tilde': 'Home als ~',
    'fmt.int': 'ganzzahlig',
    'fmt.decimal1': '1 Nachkomma',
    'fmt.short': 'gekürzt 95k',
    'fmt.long': 'voll 95000',
    'fmt.textFull': 'voll',
    'fmt.max12': 'max 12',
    'fmt.max24': 'max 24',
    'fmt.first8': 'erste 8',
    'fmt.onlyOn': 'nur wenn an',
    'fmt.always': 'immer zeigen',
    'fmt.arrowInt': '▼▲ ganzzahlig',
    'fmt.arrowDecimal': '▼▲ 1 Nachkomma',
    'fmt.cats': 'Katzen',
    'fmt.traffic': 'Ampel',
    'fmt.weather': 'Wetter',
    'fmt.battery': 'Akku',
    'fmt.countdown': 'Restzeit',
    'fmt.duration': 'Dauer',
    'fmt.currency': 'USD',
    'fmt.count': 'Anzahl',
    'fmt.raw': 'unverändert',

    'color.default': 'Standard',
    'color.usage': 'Ampel grün→rot',
    'color.inverse': 'Ampel invers',
    'color.static': 'Einfarbig',
    'color.gradient': 'Verlauf',

    'group.session': 'Session',
    'group.model': 'Modell',
    'group.workspace': 'Workspace',
    'group.context': 'Kontext',
    'group.limits': 'Limits',
    'group.cost': 'Kosten',
    'group.derived': 'Abgeleitet',
    'group.status': 'Status',
    'group.block': 'Block',

    'tab.script': 'statusline.js',
    'tab.prompt': 'Prompt',
    'tab.config': 'Config',
    'tab.cheat': 'Cheatsheet',
    'tab.load': 'Laden',

    'hint.script': 'Das ist die Datei, die installiert wird. Unten Schritt für Schritt.',
    'hint.prompt': 'An Claude geben — enthält Segmentliste, Regeln und die fertige Config.',
    'hint.config': 'Nur eine Sicherung der Einstellungen — NICHT die Datei, die installiert wird. Zum Zurückladen den Tab „Laden" nehmen.',
    'hint.cheat': 'Deine Zeile mit Erklärung zu jedem Segment, als Bild zum Aufheben oder Teilen.',
    'hint.load': 'Bestehendes statusline.js oder eine Config einfügen bzw. Datei wählen, dann Übernehmen.',

    'action.copy': 'Kopieren',
    'action.download': 'Herunterladen',
    'action.import': 'Übernehmen',
    'action.chooseFile': 'Datei wählen …',
    'action.copied': 'Kopiert',
    'action.copyFailed': 'Bitte manuell kopieren',
    'action.rendering': 'rendere …',

    'cheat.png': 'PNG herunterladen',
    'cheat.svg': 'SVG herunterladen',
    'cheat.copy': 'SVG kopieren',
    'cheat.title': 'Claude Code Statusline',

    'load.placeholder': 'Hier ein erzeugtes statusline.js einfügen (der CFG-Block wird ausgelesen) oder eine Config-JSON.\nAlternativ oben eine Datei wählen — z. B. ~/.claude/statusline.js',
    'load.fileRead': 'Datei gelesen. Jetzt „Übernehmen" drücken.',
    'load.fileFailed': 'Datei konnte nicht gelesen werden.',
    'load.done': 'Übernommen — {segments} Segmente, {lines} Zeile(n).',
    'download.sandboxed': 'Kommt kein Download an, blockiert ihn die Sandbox. Nimm die vier Schritte unten — die brauchen keinen Download.',
    'cheat.pngFailed': '{message} SVG herunterladen funktioniert als Ausweichweg.',

    'install.title': 'Installation',
    'install.path': 'Zielpfad',
    'install.step1': '<b>1.</b> Skript in die Zwischenablage. Der Knopf nimmt immer den Inhalt von <code>statusline.js</code> — unabhängig davon, welcher Tab oben offen ist.',
    'install.copyScript': 'Skript kopieren',
    'install.step2': '<b>2.</b> Zwischenablage in die Datei schreiben, in',
    'install.copyCommand': 'Befehl kopieren',
    'install.step3': '<b>3.</b> In <code>~/.claude/settings.json</code> eintragen:',
    'install.warn': 'Der Befehl muss mit <code>node</code> beginnen. Kommst du von einer <code>statusline.sh</code>, steht dort noch <code>bash</code> — dann läuft weiter das alte Skript und die Leiste bleibt leer. Die <code>.sh</code> selbst kann liegen bleiben.',
    'install.step4': '<b>4.</b> Gegenprobe — die erste Zeile der Datei muss <code>#!/usr/bin/env node</code> sein. Steht dort <code>{</code>, wurde versehentlich der <b>Config</b>-Tab kopiert statt <b>statusline.js</b>:',

    'tip.literal': 'fester Text, wird immer gedruckt',
    'tip.derived': 'berechnet · {fn}',

    'err.empty': 'Nichts zum Einlesen — bitte Datei wählen oder Text einfügen.',
    'err.notObject': 'Config muss ein Objekt sein.',
    'err.noSegments': 'Config braucht ein segments-Array.',
    'err.segmentShape': 'Segment {index} ist kein Objekt.',
    'err.noSource': 'Segment {id} hat keine bekannte Quelle.',
    'err.bash': 'Das sieht nach einer Bash-Statusline aus. Die lässt sich nicht automatisch übernehmen — bau die Segmente einmal links zusammen, danach kannst du das erzeugte statusline.js immer wieder laden.',
    'err.noCfg': 'Weder eine Config noch ein erzeugtes statusline.js — kein CFG-Block gefunden.',
    'err.pngRender': 'Das SVG ließ sich nicht rendern.',
    'err.pngBlob': 'PNG konnte nicht erzeugt werden.'
  },

  en: {
    'app.subtitle': 'Claude Code · payload schema 2.1.227',
    'field.lines': 'Lines',
    'field.dim': 'Dim separator',
    'field.separator': 'Separator',
    'field.separatorLine': 'Separator line {n}',
    'field.sort': 'Sort',
    'sort.manual': 'manual',
    'sort.reference': 'reference layout',
    'sort.group': 'by group',
    'sort.alpha': 'alphabetical',

    'panel.segments': 'Segments',
    'panel.builder': 'Order & display',
    'panel.export': 'Handover',
    'action.clearAll': 'clear all',
    'action.addBlock': '+ Block',
    'builder.hint': 'An empty emoji or label field means that part is not printed. A block is free text that always appears — handy as a group divider.',
    'builder.empty': 'Nothing picked yet — tap segments on the left.',
    'preview.empty': 'No segment active — pick one on the left.',
    'preview.aria': 'Status line preview',

    'slider.context': 'Context',
    'readout.today': 'today left',
    'readout.pace': 'pace',
    'readout.burn': 'vs even burn',

    'row.line': 'Line {n}',
    'row.labelPlaceholder': 'Label',
    'row.blockPlaceholder': 'Block text',
    'row.up': 'move up',
    'row.down': 'move down',
    'row.remove': 'remove',
    'row.emojiAria': 'Emoji for {id}',
    'row.labelAria': 'Label for {id}',
    'row.colorAria': 'Colour for {id}',
    'row.blockAria': 'Block text',

    'fmt.basename': 'Folder name',
    'fmt.last2': 'Last 2 levels',
    'fmt.full': 'Full path',
    'fmt.tilde': 'Home as ~',
    'fmt.int': 'whole number',
    'fmt.decimal1': '1 decimal',
    'fmt.short': 'short 95k',
    'fmt.long': 'full 95000',
    'fmt.textFull': 'full',
    'fmt.max12': 'max 12',
    'fmt.max24': 'max 24',
    'fmt.first8': 'first 8',
    'fmt.onlyOn': 'only when on',
    'fmt.always': 'always show',
    'fmt.arrowInt': '▼▲ whole number',
    'fmt.arrowDecimal': '▼▲ 1 decimal',
    'fmt.cats': 'Cats',
    'fmt.traffic': 'Traffic light',
    'fmt.weather': 'Weather',
    'fmt.battery': 'Battery',
    'fmt.countdown': 'Time left',
    'fmt.duration': 'Duration',
    'fmt.currency': 'USD',
    'fmt.count': 'Count',
    'fmt.raw': 'unchanged',

    'color.default': 'Default',
    'color.usage': 'Meter green→red',
    'color.inverse': 'Meter inverted',
    'color.static': 'Single colour',
    'color.gradient': 'Gradient',

    'group.session': 'Session',
    'group.model': 'Model',
    'group.workspace': 'Workspace',
    'group.context': 'Context',
    'group.limits': 'Limits',
    'group.cost': 'Cost',
    'group.derived': 'Derived',
    'group.status': 'Status',
    'group.block': 'Block',

    'tab.script': 'statusline.js',
    'tab.prompt': 'Prompt',
    'tab.config': 'Config',
    'tab.cheat': 'Cheat sheet',
    'tab.load': 'Load',

    'hint.script': 'This is the file that gets installed. Step by step below.',
    'hint.prompt': 'Hand this to Claude — it carries the segment list, the rules and the finished config.',
    'hint.config': 'A backup of the settings only — NOT the file that gets installed. Use the “Load” tab to read it back.',
    'hint.cheat': 'Your line with an explanation for every segment, as an image to keep or share.',
    'hint.load': 'Paste an existing statusline.js or a config, or choose a file, then apply.',

    'action.copy': 'Copy',
    'action.download': 'Download',
    'action.import': 'Apply',
    'action.chooseFile': 'Choose file …',
    'action.copied': 'Copied',
    'action.copyFailed': 'Please copy manually',
    'action.rendering': 'rendering …',

    'cheat.png': 'Download PNG',
    'cheat.svg': 'Download SVG',
    'cheat.copy': 'Copy SVG',
    'cheat.title': 'Claude Code status line',

    'load.placeholder': 'Paste a generated statusline.js here (its CFG block is read out) or a config JSON.\nOr choose a file above — e.g. ~/.claude/statusline.js',
    'load.fileRead': 'File read. Now press “Apply”.',
    'load.fileFailed': 'The file could not be read.',
    'load.done': 'Applied — {segments} segments, {lines} line(s).',
    'download.sandboxed': 'If no download arrives, the sandbox is blocking it. Use the four steps below — they need no download.',
    'cheat.pngFailed': '{message} Downloading the SVG works as a fallback.',

    'install.title': 'Install',
    'install.path': 'Target path',
    'install.step1': '<b>1.</b> Put the script on the clipboard. This button always takes the contents of <code>statusline.js</code>, whichever tab is open above.',
    'install.copyScript': 'Copy script',
    'install.step2': '<b>2.</b> Write the clipboard into the file, in',
    'install.copyCommand': 'Copy command',
    'install.step3': '<b>3.</b> Add this to <code>~/.claude/settings.json</code>:',
    'install.warn': 'The command has to start with <code>node</code>. Coming from a <code>statusline.sh</code>, it still says <code>bash</code> — then the old script keeps running and the line stays blank. The <code>.sh</code> itself can stay where it is.',
    'install.step4': '<b>4.</b> Check it — the first line of the file must be <code>#!/usr/bin/env node</code>. A leading <code>{</code> means the <b>Config</b> tab was copied instead of <b>statusline.js</b>:',

    'tip.literal': 'fixed text, always printed',
    'tip.derived': 'computed · {fn}',

    'err.empty': 'Nothing to read — choose a file or paste some text.',
    'err.notObject': 'The config has to be an object.',
    'err.noSegments': 'The config needs a segments array.',
    'err.segmentShape': 'Segment {index} is not an object.',
    'err.noSource': 'Segment {id} has no known source.',
    'err.bash': 'That looks like a bash status line. It cannot be imported automatically — assemble the segments once on the left, after which the generated statusline.js can be loaded again any time.',
    'err.noCfg': 'Neither a config nor a generated statusline.js — no CFG block found.',
    'err.pngRender': 'The SVG could not be rendered.',
    'err.pngBlob': 'The PNG could not be created.'
  }
};

export function t(lang, key, vars) {
  const table = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  let text = table[key];
  if (text === undefined) text = STRINGS[DEFAULT_LANG][key];
  if (text === undefined) return key;
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, name) =>
    (vars[name] === undefined ? match : String(vars[name])));
}

// A module-level current language, so pure helpers deep in the call tree do not
// each need it threaded through their signature. The state module owns it.
let current = DEFAULT_LANG;

export function setLang(value) {
  current = LANGS.indexOf(value) === -1 ? DEFAULT_LANG : value;
  return current;
}

export function lang() {
  return current;
}

export function tt(key, vars) {
  return t(current, key, vars);
}
