# Changelog

## Unreleased

- **Context alarm**: from 80% the session box's frame and gauge turn orange with *⚠ filling up*, from 90% red with *⚠ compact soon*. A toast says so once per threshold, and a line under the prompt keeps the percentage in view even with the pane closed; it clears after a compaction.
- **Turn sparklines**: a `turn` row in the session box draws the last 16 turns' cost (`$ ▁▃█▂`) and length (`⏱ ▂▅▁▃`), with their count and averages.
- **Touched follows git.** In a git repository, the touched view (`t`), its count and the ✎ marks show what `git status` reports changed right now, whoever made the change: your own edits count, and a file you revert or commit leaves the list. The view refreshes every few seconds like a folder does, and the project bar stays on top. Outside git it still shows the files Claude edited this session.
- Fix: the session box's mode tag (`auto`, `plan`, …) kept the old mode after a Shift+Tab switch until the next prompt. It now also updates after each tool call, at the end of every turn and when Claude waits for you. Claude Code raises no event for the switch itself, so a switch made while idle shows on your next prompt.
- Fix: the explorer cursor no longer jumps to another file on a live refresh when dotfiles are hidden or a filter is on.
- Windows: paths with `\` and drive letters work in the explorer, the touched view and `/strackzdevhub cd`; converted pictures go to the system temp folder.

## 0.5.0 — 2026-10-13

- **Markdown** files (`.md`, `.markdown`, `.mdx`) open rendered: headings, lists, emphasis, code blocks, tables, links. `m` switches to the source (with the git gutter) and back; `e` edits the source as any file, and leaving the editor shows it rendered again.
- **Pictures**: PNGs show as real pixels in terminals that draw them (Ghostty, kitty), at their own proportions; elsewhere their name shows in their place. JPEG, GIF, WebP and BMP are converted to PNG when ImageMagick or ffmpeg is installed, else the pane says what to install. The size shows bottom right.

## 0.4.3 — 2026-10-13

- Fix: the whole pane went blank while a request ran and came back when it ended. The live turn timer sat inside a text element, which the engine refuses (`Client inside an inline element`), so it drew its own empty pane. The timer now sits in a layout box; the pane stays up during requests with the timer ticking, and its values update when the request ends.

## 0.4.2 — 2026-10-13

- Changed lines are much easier to see: the gutter draws its own line numbers, coloured and bold on changed lines (green added, blue modified, yellow unsaved, purple staged), with a thicker bar.
- Fix: blank lines no longer collapse in the view, which shifted the text against the gutter.
- The file list colours a changed file's name by its git status, as VS Code does.

## 0.4.1 — 2026-10-13

- **Live refresh** every 3 seconds while the pane is open: files edited, created or deleted in another editor, and `git add` / `commit` run elsewhere, show without any action. An open file reloads when it changes on disk (or warns, if you have unsaved edits). Nothing redraws when nothing changed.
- **Project bar** above the files inside a git repository: `⎇ project  on branch ↑ahead ↓behind`, and `n changed · n staged` or `✓ clean`. Outside a repository, git is not called beyond finding that out.
- One `git status` per refresh for the whole repository (it was one per folder).

## 0.4.0 — 2026-10-13

- **Git gutter** beside every line, in view and edit mode: yellow = unsaved, green = added, blue = modified, red `▁` = lines deleted below, purple = staged. Layered like git: unsaved edits over unstaged changes over staged ones.
- The footer counts them: `● 2 unsaved  +3 ~2 −1  ✓4 staged`.
- The file list shows each file's git status (`M` modified, `S`/`A` staged, `U` untracked, `D` deleted, `!` conflict) and a `•` on folders holding changes.
- Outside a git repo the gutter compares with the text as first opened, so saved edits still show (`since opened`).
- Refreshes after each save, on leaving a file, after each Claude turn, and on `r` in the preview.

## 0.3.4 — 2026-10-13

- Before the first reply, the Session box says `waiting for the 1st reply` / `after 1st reply` instead of bare dashes: Claude Code reports context and effort only once a reply arrives.

## 0.3.3 — 2026-10-13

- Responsive file box header: the path folds its middle folders (`strackz › … › CODEOWNERS`), then cuts the name from the middle keeping its extension; the mode label always stays (short `VIEW`/`EDIT`/`RO` when narrow); the shortcut and `● modified` give way first.
- The line count / position moved to the bottom right, beside the key hints.
- The read-only reason moved to the note line above the code.
- The pane follows its real width (it used to draw at least 40 columns and overflow narrow panes); note and empty-state lines truncate instead of wrapping.

## 0.3.2 — 2026-10-13

- Files with ordinary long lines (HTML, CSS) are editable: only lines over 10,000 characters (minified code) make a file read-only. Lines are kept whole; the view draws the first 1,000 characters of each.
- A READ ONLY label says why beside it (e.g. `line 12 is longer than 10000 characters`).

## 0.3.1 — 2026-10-13

- The shortcut sits beside the mode label (`e to edit` / `ctrl+e to view`), and `e edit` is in the file list's hints.

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
