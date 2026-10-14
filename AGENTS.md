# AGENTS.md

Guidance for AI coding agents (and people) working on Claudashboard, a Claude Code mod: a pane with session vitals, running subagents and a file explorer with an in-pane editor. It runs inside Claude Code's mod environment: no DOM, no Node, no npm packages at run time; everything outside goes through `$`.

## Read first

- [docs/architecture.md](docs/architecture.md): how events, state, drawing and the explorer client fit together, and the module map.
- [docs/conventions.md](docs/conventions.md): the engine's loading rules and this repo's conventions.
- [docs/adr/](docs/adr/): why the code is shaped this way.

## Commands

```sh
claude plugin test .                         # all tests (unit + end to end against a mocked engine)
claude plugin validate .                     # manifest, hooks and state contract, as the engine reads them
npx prettier --write hooks tests             # formatting; CI runs --check
claude --plugin-dir .                        # a session running this working copy, hot-reloading on save
```

To see a change in a running session, follow the `claudashboard-dev` skill (`.claude/skills/claudashboard-dev/SKILL.md`): `/reload-plugins` when installed from this folder, or nothing at all in watch mode. Never uninstall and reinstall.

Type-checking needs the engine's typings, which Claude Code writes into `.claude-plugin/types/` when it loads the mod (`claude --plugin-dir .` once); then `npx tsc -p .`.

## Rules that break the mod if ignored

The engine rejects the whole hooks module (`hooks module did not load`) when:

1. a helper that receives `$` from another file is an arrow function in a `const` instead of a `function` declaration;
2. `read` or `update` of an atom is called outside `hooks/state.ts`;
3. `types/index.d.ts` is split or imports anything;
4. a `Client` element is placed inside a `Text`.

## Working here

- Put decisions in pure modules (no `$`) with a test in the mirrored `tests/` folder; keep I/O modules thin.
- Find code by feature: `hooks/explorer/` (with `editor/`, `git/`, `media/`), `hooks/agents/`, `hooks/session/`, `hooks/shared/`.
- Bookkeeping in hooks must never fail the event: `.catch(logged($, 'what'))`.
- Paths are `/`-separated inside; convert incoming ones with `toSlash`.
- Before finishing: `claude plugin test .`, `claude plugin validate .` and the Prettier check all pass. A user-visible change gets a `CHANGELOG.md` entry.
- A new architectural decision gets an ADR in `docs/adr/`, numbered after the last one.
