# Statusline Builder — Design

Date: 2026-08-11
Status: approved

## Problem

Claude Code renders a status line by piping a JSON payload into a user-supplied
command. Composing that command by hand is tedious: the payload has ~40 fields,
the interesting numbers (burn rate, pace, mood) are derived rather than present,
and ANSI colour codes are unpleasant to write by hand.

The existing `~/.claude/statusline.sh` on this machine is broken: it shells out
to `jq` twenty times, and `jq` is not installed. Every field resolves to empty,
so the status line renders as a blank line.

## Goal

A single-page web app that lets the user assemble a status line by toggling,
ordering and styling segments, with a live preview, and that exports:

1. a ready-to-run `statusline.js`
2. a handover prompt for Claude
3. a JSON config for re-import

## Runtime target

The generated status line is a **Node script**, invoked as:

```json
{ "statusLine": { "type": "command", "command": "node C:/Users/<you>/.claude/statusline.js" } }
```

Measured on this machine: Node cold start ~80 ms; `bash` alone ~68 ms before any
`jq` subprocess. Node needs one process and no external tools, and floating point
maths for the derived metrics is trivial. Bash+jq and PowerShell were rejected.

Node-only. No Bash emitter (YAGNI).

## Payload schema

Extracted from the Claude Code binary v2.1.227. Optional keys marked `?`.

```
session_id, transcript_path, cwd, prompt_id, permission_mode, agent_id, agent_type
effort?: { level }                       low | medium | high | xhigh | max
session_name?
model: { id, display_name }
workspace: { current_dir, project_dir, added_dirs[], git_worktree?, repo? }
version
output_style: { name }
cost: { total_cost_usd, total_duration_ms, total_api_duration_ms,
        total_lines_added, total_lines_removed }
context_window: { total_input_tokens, total_output_tokens, context_window_size,
                  current_usage: { input_tokens, output_tokens,
                                   cache_creation_input_tokens,
                                   cache_read_input_tokens },
                  used_percentage, remaining_percentage }
exceeds_200k_tokens, fast_mode
thinking: { enabled }
rate_limits?: { five_hour?:  { used_percentage, resets_at },
                seven_day?:  { used_percentage, resets_at } }
vim?:      { mode }
agent?:    { name }
remote?:   { session_id }
pr?:       { number, url, review_state?, kind? }
worktree?: { name, path, branch, original_cwd, original_branch }
```

There are exactly two rate-limit buckets: `five_hour` and `seven_day`. No
five-day bucket exists. `resets_at` is parsed defensively — a number below 1e11
is treated as epoch seconds, at or above as milliseconds, a string via
`Date.parse`.

## Segment model

Every segment is one object. The catalogue is data; the renderer is generic.

```js
{
  id:        'ctx_used',
  group:     'context',
  label:     'ctx',
  emoji:     '🧠',
  source:    { kind: 'path', path: 'context_window.used_percentage' }
           | { kind: 'derived', fn: 'weekly_pace' },
  format:    { type: 'percent', decimals: 0 },
  showLabel: false,
  showEmoji: true,
  line:      0,
  color:     { mode: 'threshold', stops: [[0,'#7ec699'],[50,'#e0c46c'],[90,'#e06c75']] },
  hideWhen:  'never' | 'empty' | 'zero'
}
```

`hideWhen: 'empty'` is the default: if the source resolves to `null`/`undefined`,
the segment is dropped rather than printed as an empty slot.

## Derived metrics

All computed from `rate_limits.seven_day` (`U` = used percentage, `R` = reset
timestamp), with a fixed 7-day window. Let `f` be the elapsed fraction of the
window, `f = (now - (R - 7d)) / 7d`, clamped to `[0, 1]`.

| id | display | formula |
|---|---|---|
| `weekly_even_burn` | `▼−11` | `U − f·100`; negative renders `▼`, positive `▲` |
| `weekly_pace` | `17%/d` | `(100 − U) / daysLeft`, `daysLeft = (R − now)/86400` |
| `weekly_today_left` | `72%t` | day index `d = floor(f·7)`; daily slice `s = 100/7`; used today `≈ U − d·s`; result `(s − usedToday)/s · 100`. May go negative — that means today is eating into tomorrow. |
| `mood` | `😺` | worst of `{ctx%, 5h%, 7d%}` mapped through an emoji threshold ladder |

`weekly_today_left` is stateless and therefore an approximation: it assumes usage
before today tracked the even-burn line. Documented in the README so the user can
reason about it. No history file is kept.

Reset countdowns (`5h resets in 4h54m`) are formatted from `resets_at − now`.

## Components

### `index.html`

Self-contained: inline CSS and JS, no CDN, no build step, no external requests —
so it works offline by double-click and satisfies the Artifact CSP.

Three regions:

- **Catalogue** — every segment as a toggle, grouped: session, model, workspace,
  context, limits, cost, derived, status.
- **Builder** — active segments, reorderable by drag & drop and by keyboard.
  Per segment: emoji picker, label toggle, colour mode, format options, target
  line, visibility rule.
- **Preview & export** — the assembled line rendered with real ANSI colours
  translated to CSS, on a terminal-like background. Sliders for context %,
  5h % and 7d % drive the preview payload so threshold colours and the mood
  emoji can be exercised without waiting for real usage. Export tabs:
  `statusline.js`, Claude prompt, JSON config.

State lives in one plain object, persisted to `localStorage`. Every mutation
re-renders preview and exports from that object — one source of truth.

### Generator

Emits a generic renderer with the config inlined at the top, not straight-line
code for the chosen segments. Roughly 250 lines, hand-editable afterwards, and
legible to Claude if the user wants further changes.

### Styling

- ANSI-256 and truecolor (`\x1b[38;2;r;g;bm`)
- Colour modes: static, threshold (stops), gradient (interpolate between two hex
  colours across a range)
- Separators: `|`, `·`, `▸`, powerline ``, custom string; dim on/off
- One to three lines

## Error handling

The generated script wraps rendering in `try/catch`. On any failure it prints a
minimal fallback (model plus directory) rather than throwing — a broken status
line must never disrupt a session. Missing payload keys drop their segment.
`JSON.parse` of empty stdin yields `{}` rather than an exception.

## Testing

- `sample-payload.json` — a realistic payload matching the schema above
- `test.sh` — pipes the sample through the generated script and prints the result
- The app itself carries a payload editor for checking against real captures

## Files

```
statusline/
├── index.html
├── sample-payload.json
├── test.sh
├── README.md
└── docs/superpowers/specs/2026-08-11-statusline-builder-design.md
```

## Out of scope

- Bash/jq or PowerShell emitters
- A history file for exact per-day usage accounting
- Editing `~/.claude/settings.json` automatically; the app shows the snippet and
  installation stays a deliberate user action
