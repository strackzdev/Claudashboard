# Changelog

## 0.3.0 — 2026-10-13

- **Edit files in the pane.** `e` switches to edit mode (from the preview, or from the list on a file); a **VIEW MODE / EDIT MODE / READ ONLY** label sits top right and toggles on click.
- Editing: typing and paste, Enter with auto-indent, Backspace/Delete across lines, arrows, Home/End, paging, click to place the cursor; `ctrl+s` save, `ctrl+z` undo (100 steps), `ctrl+e` back to view (asks before discarding).
- Saves keep line endings and the final newline; files the preview had to alter are read-only; a save never silently overwrites a file changed on disk.
- `/strackzdevhub save`.

## 0.2.1 — 2026-10-13

- Renamed to **STRACKZDEVHUB**; command `/strackzdevhub`.
- Agent tracking can never fail an Agent call; missing usage data no longer stops the pane opening.
- `h` and `q` go back from the preview; the last line is reachable when a note shows; clicks stay aligned when an error is shown.
- Breadcrumb click while filtering goes back instead of erasing a character.
- Agents section shrinks to fit short panes; vitals rows truncate instead of wrapping.
- `/strackzdevhub cd` refuses `..`, accepts the root's absolute path, and reports a missing folder.
- `showHidden` from `/config` applies on the next load.

## 0.2.0 — 2026-10-13

- Three outlined sections: **Session**, **Agents**, **Files**.
- Model shown from session start (pill, `1M` tag for long-context models).
- **Agents** section: one card per running subagent (name, type, model, steps, tools, context, live timer, task, current tool). Cards leave when the agent finishes.
- Explorer redesign: breadcrumb, position counter, full-width selection, hover highlight, key-hint bar; click the breadcrumb to go back.
- Explorer tolerates partial props across hot reloads.

## 0.1.0 — 2026-10-13

- First version: vitals header (model, effort, permission mode, context gauge, cost, rate limits, turn timer) and a keyboard + mouse file explorer with syntax-highlighted preview.
