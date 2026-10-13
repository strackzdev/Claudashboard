# STRACKZDEVHUB

**A clean hub pane for Claude Code.** It shows the session's vitals, the subagents that are working right now, and a file explorer you drive with the mouse or the keyboard, with a syntax-highlighted preview and a small editor inside the pane.

```
╭──────────────────────────────────────────────────────╮
│ SESSION                                  ● 0:37      │
│  opus 5.5  1M  effort ●●●○○ high               auto  │
│ ctx  ▰▰▰▰▰▱▱▱▱▱ 51%  102k / 1.0M  ⟲1    $1.84 +$0.21 │
│ lim  5h ▰▰▱▱▱▱ 38%    7d ▰▱▱▱▱▱ 12%                  │
╰──────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────╮
│ AGENTS · 1 running                                   │
│ ◆ Explore  haiku 5.5  4 steps · 3 tools · 18k   0:42 │
│   ↳ Find the auth middleware  ⟶ Read middleware.ts   │
╰──────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────╮
│ project › src › auth                          3/12   │
│ ──────────────────────────────────────────────────── │
│▌▸ lib/                                               │
│ ✎ middleware.ts                    4.8 KB · just now │
│ · session.ts                       1.2 KB · 1h ago   │
│ ⏎ open  ⌫ back  / filter  . dotfiles  t touched  @ … │
╰──────────────────────────────────────────────────────╯
```

Every number comes from real session events. Nothing leaves your machine.

## Install

You need Claude Code **2.1.287 or later**, which is when mods arrived.

Inside Claude Code:

```
/plugin marketplace add strackzdev/claude_strackzdevhub
/plugin install strackzdevhub@strackzdevhub
/strackzdevhub
```

<details>
<summary>From a local clone</summary>

```sh
git clone https://github.com/strackzdev/claude_strackzdevhub
claude plugin marketplace add ./claude_strackzdevhub
claude plugin install strackzdevhub@strackzdevhub
```

To try it for a single session without installing it:

```sh
claude --plugin-dir ./claude_strackzdevhub
```

</details>

## What you see

### Session
| Shows | Notes |
| --- | --- |
| **Model** | The main loop's model. `1M` means the long-context variant. It's read when the session starts and updated on every step. |
| **Effort** | The current turn's reasoning effort, from `low` to `max`. |
| **Permission mode** | `default`, `auto`, `plan`, `acceptEdits` or `bypassPermissions`, each in its own colour. |
| **Turn** | `●` and a live timer while Claude works. `○ idle` and the last turn's length when it's done. |
| **Context** | A gauge plus used / window tokens. Green, then amber at 70%, then red at 85%. `⟲n` counts compactions. |
| **Cost** | The session total, plus what the last turn added. |
| **Limits** | The 5-hour and 7-day rate-limit windows, when your plan reports them. |

### Agents
This section appears only while subagents run. Each running agent gets a card showing:
- its name, type and model
- steps, tool calls, the context it's using and a live timer
- its task (`↳`)
- the tool it's running right now (`⟶`), such as `Read middleware.ts` or `$ npm test`

A card disappears when its agent finishes. Up to 4 cards are shown, then `+n more`.

### Files
The explorer starts at the session's working directory.

**Mouse:** click a folder to open it, or a file to preview it. Click the breadcrumb to go back. Rows highlight as you hover over them.

**Keyboard:** click the list once to give it the keyboard. **Esc** hands the keyboard back to the prompt.

| Key | In the list | In the preview |
| --- | --- | --- |
| `↑` `↓` / `k` `j` | move | scroll |
| `PgUp` `PgDn` | page | page (`Space` too) |
| `Home` `End` | first / last | top / end |
| `g` `G` | — | top / end |
| `⏎` `→` `l` | open | — |
| `⌫` `←` `h` | parent folder (clears a filter first) | back to the list (`q` too) |
| `/` | filter by name as you type (`⏎` or `Tab` to finish) | — |
| `.` | show / hide dotfiles | — |
| `t` | only files Claude touched this session | — |
| `r` | refresh | — |
| `@` | insert `@path` into your prompt | insert `@path` into your prompt |
| `e` | open the file straight into edit mode | switch to edit mode |

### Editing a file

A label at the top right of the file box shows the mode: **VIEW MODE** (blue), **EDIT MODE** (yellow, and the box border turns yellow too) or **READ ONLY**. The shortcut is shown right beside it (`e to edit` / `ctrl+e to view`). Click the label to switch modes, or press `e`.

| Key, in edit mode | Does |
| --- | --- |
| typing, `Space`, `Tab` | insert text. `Tab` inserts a tab if the file indents with tabs, otherwise two spaces. Pasted text goes in whole, newlines included. |
| `⏎` | new line, keeping the current line's indentation |
| `⌫` `Del` | delete before / after the cursor, joining lines at the edges |
| `↑` `↓` `←` `→` | move. Left and right wrap between lines. |
| `Home` `End` | start of the line's indentation (press again for column 1) / end of line |
| `PgUp` `PgDn`, `ctrl+Home` `ctrl+End` | page / start and end of the file |
| click | put the cursor there |
| `ctrl+s` | save (or run `/strackzdevhub save`) |
| `ctrl+z` | undo, up to 100 steps per file |
| `ctrl+e` | back to view mode. With unsaved changes, the first press warns and a second discards them. |

`● modified` shows next to the label until you save, and the counter shows `Ln, Col`. While you're editing, `Esc` hands the keyboard back to the prompt and keeps your edits. Click the file box to carry on.

**Safety:**
- **Exact saves:** a save writes the file in the shape it was read, keeping its line endings (LF or CRLF) and whether it ends with a newline.
- **Read-only files:** editing is off for any file the preview had to alter to show it, so a save can never write the altered text. That means binaries, files over 1 MB or 5,000 lines, files with control characters, minified lines over 10,000 characters, or mixed line endings. The label then reads **READ ONLY**, and the reason shows on the line above the code.
- **Changes made elsewhere:** if the file changed on disk after you opened it, for example because Claude edited it, `ctrl+s` warns first and only a second `ctrl+s` overwrites it. Without unsaved edits, the open file simply reloads when Claude changes it.

Files Claude edited or created this session are marked **✎** in yellow, and new files appear automatically. The preview won't show binary files or files over 1 MB, and it shows at most the first 5,000 lines.

## Commands

| Command | Does |
| --- | --- |
| `/strackzdevhub` | open the hub |
| `/strackzdevhub close` | close it |
| `/strackzdevhub save` | save the file being edited |
| `/strackzdevhub cd <path>` | jump the explorer to a folder: relative to the working directory, or an absolute path inside it (`..` is refused) |
| `/strackzdevhub reset` | clear the touched files and agents, and move the explorer back to the root |

## Configure

Open `/config` and find **strackzdevhub**, or set the values under `pluginConfigs.strackzdevhub` in your settings.

| Option | Default | |
| --- | --- | --- |
| `palette` | `onedark` | `onedark` uses fixed One Dark colours. `theme` follows your Claude Code theme. |
| `showHidden` | `false` | Show dotfiles in the explorer by default. |
| `openOnStart` | `true` | Open the pane when a session starts. |

## Layout tips

- In **fullscreen** at 110 columns or wider, the pane docks beside the transcript. Otherwise it sits inline above the prompt, about 30 rows tall.
- Every row fits the pane's width: the file path folds its middle folders (`strackz › … › CODEOWNERS`) and then shortens the name, the mode label switches to `VIEW` / `EDIT` / `RO`, and the line count sits at the bottom right.
- When it gets cramped, close other panes. `/strackzdevhub close` hides STRACKZDEVHUB until you run `/strackzdevhub` again.

## Develop

```
hooks/register.tsx   hooks: vitals, agents, commands, the pane drawing
hooks/explorer.tsx   the explorer's client module (keys, clicks, list, preview, editor)
hooks/editor.ts      pure editor logic: keys against the text, cursor, tabs (unit-tested)
hooks/elapsed.tsx    a live timer that ticks without redrawing the pane
hooks/core.ts        pure logic: formatting, paths, the key reducer (unit-tested)
types/index.d.ts     the mod's $.state contract
tests/               claude plugin test
```

```sh
claude plugin validate .     # manifest, marketplace and hooks, as the engine reads them
claude plugin test .         # unit and drawing tests
claude --plugin-dir .        # a session with your working copy loaded, hot-reloading on save
```

Once the mod has loaded, `.claude-plugin/types/` holds the engine's typings, so `npx tsc -p .` type-checks the code.

## License

MIT © José Pinto
