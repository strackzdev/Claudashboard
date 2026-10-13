# 0004: One self-contained types contract

Date: 2026-10-14 · Status: accepted

## Context

`types/index.d.ts` declares the values the mod keeps in `$.state` (`interface PluginState`), and `plugin.json` names it in `"types"`. Splitting it by feature, like `hooks/`, was considered.

## Decision

Keep it one file. The engine expects the contract to be a single self-contained `.d.ts` with no `import` or reference: it checks the module against it (`claude plugin validate`) and copies it into the types of any mod that lists this one under `dependencies`.

## Consequences

- The value types (`Vitals`, `Explorer`, `Preview`, `Entry`, `Agent`, `RepoInfo`) live in that file, and modules import them from `../types` (`../../types` deeper down).
- Types that never reach `$.state` (props, messages, reducer keys) live with their module: `UiMessage` and `ExplorerProps` in `explorer/client.tsx`, `Key` in `explorer/model.ts`.
