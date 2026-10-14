# 0005: `/` paths inside, converted where they come in

Date: 2026-10-14 · Status: accepted

## Context

On Windows the session's working directory and a tool call's `file_path` arrive as `C:\Users\me\proj\a.ts`, while git and the explorer's own paths use `/`. Comparing the two put the touched-files view and the git letters out of step, and the picture cache assumed `/tmp`.

## Decision

Inside the mod every path uses `/`. `toSlash` converts a path where it enters (the session's cwd, a tool's `file_path` or `notebook_path`, a `/claudashboard cd` argument), and `isAbsolute` recognises `/a` and `C:/a`. The picture cache goes under `TMPDIR`, `TEMP` or `TMP`, created with `$.fs.write`.

## Consequences

- Path helpers in `shared/paths.ts` assume `/` and stay simple.
- Drive-letter case is not normalised: `c:/` and `C:/` compare as different roots.
- New inputs that carry a path must go through `toSlash`.
