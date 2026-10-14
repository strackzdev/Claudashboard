# 0003: Every atom is read and written in state.ts

Date: 2026-10-14 · Status: accepted

## Context

The engine lists which `$.state` values a mod reads and writes by scanning the source. `read($, atom)` and `update($, atom, fn)` are accepted only where the atom was made, with `atom(...)` in a `const` of that same file. An atom imported from another file makes the module fail to load.

## Decision

`hooks/state.ts` declares the atoms (`vitals`, `explorer`, `touched`, `agents`, `activity`, `gitTick`) and is the only file that calls `read` or `update`. It exports helpers for every access the other modules need: `getExplorer`, `updateExplorer`, `setPreview`, `setExplorer`, `updateVitals`, `updateAgents`, `updateTouched`, `bumpGitTick`, `readGitTick`, ….

## Consequences

- One file shows everything the mod stores, and how old stored values are upgraded on read (`normalize`, `emptyPreview`, `normalizeAgent`).
- A new atom means: add it to `types/index.d.ts`, declare it in `state.ts`, add a helper there.
- Every helper takes `$`, so it is a `function` declaration (engine rule, [conventions](../conventions.md)).
