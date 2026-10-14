# 0001: Folders by feature

Date: 2026-10-14 · Status: accepted

## Context

All of `hooks/` sat in one folder: 17 files, pure and I/O, explorer and session mixed. A contributor fixing the git gutter had to know that `git.ts`, `gitdiff.ts`, `pane.tsx` and `explorer-props.ts` were the files involved.

## Decision

Group by the feature a contributor works on: `session/`, `agents/`, `explorer/` (with `editor/`, `git/`, `media/` inside), and `shared/` for helpers two features use. Wiring (`register.tsx`), state (`state.ts`) and the pane's drawing (`pane.tsx`) stay at the top. `tests/` mirrors the same folders.

## Consequences

- One folder answers "where is the git code?".
- Pure and I/O files sit side by side in a feature folder; the file header, not the folder, says which kind a file is ([ADR 0002](0002-pure-core-io-shell.md)).
- Client modules are referenced by path from `pane.tsx` (`module="./explorer/client.tsx"`): moving one means updating that string. `claude plugin validate` lists the surface modules it found.
