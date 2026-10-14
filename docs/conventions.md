# Modding conventions

The rules this mod follows. The first section is enforced by the engine: break one and the mod does not load. The rest keep the code easy to change.

## Engine rules (the mod does not load otherwise)

The engine reads the hooks module's source before it runs it, so it can list what the mod calls, reads and stores. A violation shows only as `hooks module did not load: …` in `claude plugin test` or the session's transcript.

1. **`$` crosses a file only into a `function` declaration.** A helper in another file that takes `$` is `export async function load($: EngineInterface, …)`, never `export const load = async ($) => …`.
2. **`$` is always spelled `$.noun.method(...)`** at the call site, `on` as `on('<event>', hook)`.
3. **`read` and `update` of an atom happen only in `hooks/state.ts`**, the file that declares it. Other modules call its helpers (`getExplorer`, `updateExplorer`, `setPreview`, `updateAgents`, …). See [ADR 0003](adr/0003-state-in-one-file.md).
4. **`$.env.get` and `$.env.set` take a string literal** (`$.env.get('TMPDIR')`).
5. **`types/index.d.ts` stays one self-contained file** with no `import`, declaring every atom under `PluginState['claudashboard']`. See [ADR 0004](adr/0004-single-types-contract.md).
6. **A client module (`Client`) is only ever a child of a `Box`.** Inside a `Text` the engine refuses the whole pane.

`claude plugin validate .` checks most of these without starting a session.

## Where code goes

- **Pure logic in a pure module, with a test.** A function that decides something (what a key does, what a row shows, how a diff marks lines) takes data and returns data, and lives in a module with no `$`. Its file starts with `// Pure logic for Claudashboard: … No \`$\` here, so it is testable.` See [ADR 0002](adr/0002-pure-core-io-shell.md).
- **I/O modules stay thin**: read, call the pure function, write the result.
- **Folders by feature** ([ADR 0001](adr/0001-feature-folders.md)): explorer code under `hooks/explorer/`, git under `explorer/git/`, and so on. Shared helpers go in `hooks/shared/` only once a second feature needs them.
- **Tests mirror `hooks/`**: `hooks/explorer/git/gitdiff.ts` is tested by `tests/explorer/git/gitdiff.test.ts`. Behaviour across modules (keys to disk, the drawing) goes in `tests/pane.test.ts`.
- **No I/O while drawing.** `ui.render` reads atoms and draws. Fetching happens on events or in `poll`.

## Behaviour rules

- **Bookkeeping never fails the event it rides on.** Watching a tool call, a spawn or a turn must not change its result: wrap the bookkeeping in `.catch(logged($, 'what'))`, which writes the error to the debug log (`claude --debug`). Use `.catch(() => null)` only where `null` means something, such as "the file is missing".
- **Stored values may come from an older version.** Read atoms through the `get*` helpers in `state.ts`, which fill missing fields from the defaults (`normalize`, `emptyPreview`, `normalizeAgent`). A new field gets a default there.
- **Paths are `/`-separated inside the mod.** Convert with `toSlash` where a path comes in (the session's cwd, a tool's `file_path`, a command argument) and test with `isAbsolute`, never `startsWith('/')`. See [ADR 0005](adr/0005-slash-paths.md).
- **Unsaved edits are never lost silently.** Reloading, discarding or overwriting asks first (`confirm: 'discard' | 'overwrite'`).
- **Nothing leaves the machine.** No network calls.

## Style

- Formatting is Prettier with `.prettierrc`; CI checks it. Run `npx prettier --write hooks tests`.
- Booleans read as questions: `isDirty`, `isFiltering`, `isByClaude`.
- Comments say why, or what a value means, in plain sentences; doc comments (`/** … */`) on exported functions.
- Small helpers are arrow functions in a `const`; anything that takes `$` is a `function` (rule 1).
- No new dependencies: the environment has no Node and no npm packages at run time.

## Releasing

1. Bump `version` in `.claude-plugin/plugin.json`.
2. Add a section at the top of `CHANGELOG.md`: `## x.y.z — YYYY-MM-DD`, then bullets written for users (what they see, then **Fix:** items).
3. Users get it with `claude plugin update claudashboard` and `/reload-plugins`.
