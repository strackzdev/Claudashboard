---
name: claudashboard-dev
description: Run and see a change to Claudashboard live while developing it, without uninstalling and reinstalling. Use whenever you change the mod (a feature, a fix, a layout tweak) and the person wants to try it, or says the pane doesn't show their change, asks to reload, hot reload, or set up the dev loop.
---

# Developing Claudashboard live

The mod runs from this repository's folder, wherever the person cloned it. Find it once with `git rev-parse --show-toplevel` and use that path (written `<repo>` below) in every command; never assume a path. A change reaches the running session one of two ways; never ask the person to uninstall and reinstall.

## 1. Find out how the session loads the mod

```sh
claude plugin list 2>&1 | grep -A4 claudashboard
```

- `Read from: <repo>` (installed from this folder as a marketplace): **reload mode**. After a change the person types `/reload-plugins`; the engine re-reads the folder. No new version, no reinstall.
- A path under `~/.claude/plugins/cache/`: installed from GitHub, so it runs a copy and never sees local edits. Fix it once (step 3).
- Not listed, but the pane shows: loaded with `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`: **watch mode**. Saves reload by themselves: saves made during your turn reload once when the turn ends. Nothing to type.

## 2. After every change

1. Run the checks: `claude plugin test .`, `claude plugin validate .`, `npx prettier --check hooks tests`.
2. Tell the person the one step left:
   - reload mode: "type `/reload-plugins`, then `/cdb`";
   - watch mode: nothing; it reloads when your turn ends.
3. If the pane doesn't change or disappears, the module failed to load: the transcript shows a dim line `claudashboard: … did not load: <reason>` (watch mode), or run `claude --debug`. The usual causes are the engine rules in AGENTS.md.

A reload runs `register` again and fires `session.start` again. `$.state` atoms survive it; module variables (undo history, git bases, the picture cache) start over.

## 3. Setting up (once)

**Reload mode** (installed from this folder):

```
/plugin uninstall claudashboard@claudashboard
/plugin marketplace remove claudashboard
/plugin marketplace add <repo>
/plugin install claudashboard@claudashboard
```

If `marketplace add` reports a name other than `claudashboard` (an old name such as `strackzdevhub`), a stale entry for this folder exists. Rename its key to `claudashboard` under `extraKnownMarketplaces` in `~/.claude/settings.json` and in `~/.claude/plugins/known_marketplaces.json` (back both up first), then install again.

**Watch mode** (reloads on save, recommended for long sessions of changes):

1. Remove the installed copy so the mod doesn't load twice: `/plugin uninstall claudashboard@claudashboard`.
2. Either start sessions from the repository with `claude --plugin-dir .`, or set it for every session in `~/.claude/settings.json` (user settings only; a project's settings are ignored for this), with the absolute `<repo>` path (`~` works):
   ```json
   { "env": { "CLAUDE_CODE_PLUGIN_DIRS": "<repo>" } }
   ```
   Several folders are separated by `:` (`;` on Windows).
3. Restart Claude Code once. From then on every save reloads the mod.

Back to normal use (the published version): remove `CLAUDE_CODE_PLUGIN_DIRS` and install from `strackzdev/Claudashboard`.
