# 0002: Pure core, thin I/O shell

Date: 2026-10-14 · Status: accepted

## Context

Hooks receive `$`, and everything `$` does (files, git, the session) needs a mocked engine to test. Logic written inside hooks could only be tested end to end, slowly and with a lot of setup.

## Decision

Decisions live in pure modules: no `$`, no atoms, data in and data out (`reduceKey`, `reduceEdit`, `explorerProps`, `lineMarks`, `previewOf`, …). I/O modules read, call the pure function, and write the result. Reducers return an `effect` describing the I/O they need (`{ kind: 'open', entry }`), and `register.tsx` performs it.

## Consequences

- Most behaviour is covered by fast unit tests with plain values.
- The I/O modules stay short, and `tests/pane.test.ts` covers them end to end.
- A new feature usually adds a pure function and its test before any hook changes.
