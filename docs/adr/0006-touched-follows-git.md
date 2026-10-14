# 0006: Touched follows git

Date: 2026-10-14 · Status: accepted

## Context

"Touched" counted the files Claude's Edit and Write tools changed this session. It only grew: a file the person edited themselves never showed, and a file reverted or committed stayed touched until `/claudashboard reset`.

## Decision

Inside a git repository, touched is what `git status` reports changed now (modified, staged, untracked; deleted files left out, as there is nothing to open), as paths from the explorer's root. The touched view lists those files and refreshes with the live refresh; the ✎ marks and the `touched (n)` count follow the same list (`RepoInfo.changedFiles`). Outside git, where nothing else can tell what changed, touched stays the files Claude edited this session (the `touched` atom).

## Consequences

- One git status per refresh serves the letters, the project bar and the touched view.
- The touched view stats every changed file on each refresh: fine for normal repositories, slow for one that lists thousands of untracked files without a `.gitignore`.
- The `touched` atom matters only outside git; `/claudashboard reset` clears it.
