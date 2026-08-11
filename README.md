# Statusline Builder

A single-page tool for composing a Claude Code status line — pick segments, order
them, style them, and export a runnable script, a handover prompt for Claude, or a
config file you can read back in later.

Open `index.html` by double-clicking it. There is no build step, no server, and no
network access: everything is inlined into that one file.

## Composing a line

- **Labels** — every row has a label field. Leave it empty and nothing is printed;
  type into it and that exact text is used, so `ctx` can become `kontext` or `k`.
  The emoji field behaves the same way: empty means no emoji.
- **Blocks** — `+ Block` adds a segment that is just free text. Unlike a real
  segment it always prints, so it works as a fixed divider between groups. Drag it
  wherever you want the break.
- **Separators per line** — each line has its own separator field, with the common
  ones offered as suggestions and anything else accepted as free text.
- **Loading an existing line** — the **Laden** tab reads a `statusline.js` this tool
  generated (it pulls the `CFG` block back out) or a saved config JSON, from a paste
  or a file. A hand-written bash status line cannot be imported; the app says so
  rather than failing quietly.

Everything is kept in `localStorage`, so the page reopens where you left it.

### If Herunterladen does nothing

The published artifact runs inside a sandboxed iframe, and some browsers block
downloads there. Use **Kopieren** instead, or open `index.html` locally where the
download works normally.

## Why Node and not jq

Most status line scripts shell out to `jq` for every field. That is slow — twenty
`jq` processes per render — and it fails silently when `jq` is not installed: every
field resolves to empty and the status line renders as a blank line.

The generated script is plain Node with no dependencies. Measured on Windows 11:

| Approach | Cost per render |
|---|---|
| Node, one process | ~80 ms |
| `bash` alone, before any `jq` call | ~68 ms |
| PowerShell | ~250–400 ms |

## Install

1. Build the line in the app, then copy the **statusline.js** tab.
2. Save it as `~/.claude/statusline.js` (on Windows, e.g. `C:/Users/<you>/.claude/statusline.js`).
3. Point `~/.claude/settings.json` at it:

```json
"statusLine": {
  "type": "command",
  "command": "node C:/Users/<you>/.claude/statusline.js"
}
```

Everything configurable in the generated file lives in the `CFG` object at the top,
so it stays editable by hand afterwards.

## The payload

Field names were read out of the Claude Code binary, version 2.1.227. Optional keys
are marked `?`.

```
session_id, transcript_path, cwd, prompt_id, permission_mode, agent_id, agent_type
effort?: { level }                      low | medium | high | xhigh | max
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
rate_limits?: { five_hour?: { used_percentage, resets_at },
                seven_day?: { used_percentage, resets_at } }
vim?:      { mode }
agent?:    { name }
remote?:   { session_id }
pr?:       { number, url, review_state?, kind? }
worktree?: { name, path, branch, original_cwd, original_branch }
```

There are exactly two rate-limit buckets: `five_hour` and `seven_day`. There is no
five-day bucket. `resets_at` is accepted as epoch seconds, epoch milliseconds, or an
ISO string.

## Derived metrics

Four values in the catalogue are not in the payload. They are computed from the
weekly bucket, where `U` is `seven_day.used_percentage`, `R` is `resets_at`, and `f`
is the elapsed fraction of the seven-day window.

| Segment | Example | Formula |
|---|---|---|
| `weekly_even_burn` | `▼10` | `U − f·100`, rendered `▼` under the line and `▲` over it |
| `weekly_pace` | `17%/d` | `(100 − U) / daysLeft` — what you can spend per day from here |
| `weekly_today_left` | `73%t` | day index `d = ⌊f·7⌋`, slice `s = 100/7`, used today `U − d·s`, result `(s − usedToday)/s · 100` |
| `mood` | `😼` | the worst of context %, 5h % and 7d %, mapped through an emoji ladder |

`weekly_today_left` is capped at 100 but may go negative — below zero means today has
started eating tomorrow's share.

It is also an **approximation**. The payload carries no history, so the calculation
assumes usage before today tracked the even-burn line. If you burned a lot on Monday
and nothing since, it will read low. `weekly_even_burn` is exact and is the better
number to trust for the week as a whole.

## Development

```bash
npm test        # node --test — 99 tests
node build.js   # regenerates index.html from src/
./test.sh path/to/statusline.js   # pipes sample-payload.json through a generated script
```

Source layout:

| File | Responsibility |
|---|---|
| `src/format.js` | value formatters; every one returns `null` for input it cannot show |
| `src/derive.js` | the weekly burn maths |
| `src/color.js` | static, threshold and gradient colours, plus ANSI wrapping |
| `src/catalog.js` | the segment catalogue — all 44 segments as data |
| `src/render.js` | config plus payload to terminal output or preview markup |
| `src/runtime.js` | the standalone engine that ships inside the generated script |
| `src/generate.js` | the three export formats |
| `src/state.js` | one state object, persisted to `localStorage` |
| `src/ui.js`, `src/ui-export.js` | catalogue, builder rows, preview, export panel |
| `build.js` | strips imports and exports, concatenates into `index.html` |

### On the duplicated runtime

`src/runtime.js` repeats the logic of `format.js`, `derive.js`, `color.js` and
`render.js` as a string, because the generated file lives in `~/.claude` and has to
stand alone. That duplication is guarded rather than trusted: `test/generate.test.js`
renders the same config through both paths — once via `renderAnsi`, once by actually
executing the generated script as a subprocess — and asserts the two outputs are
byte-identical, across every segment in the catalogue. Changing one path without the
other fails the suite.

The generated script honours `SL_NOW` (epoch milliseconds) so those comparisons are
reproducible.
