export type Limit = { kind: string; pct: number }

export type Vitals = {
  model: string
  effort: string
  mode: string
  pct: number | null
  tokens: number | null
  window: number | null
  costUsd: number | null
  limits: Limit[]
  compactions: number
  turnStartedAt: number | null
  turnCostStart: number | null
  lastTurnMs: number | null
  lastTurnCost: number | null
}

/** One explorer row; `path` is relative to the root, '/'-separated. */
export type Entry = {
  name: string
  path: string
  kind: 'file' | 'dir' | 'other'
  size: number
  mtimeMs: number
  /** git's two status letters for a file (`' M'`, `'M '`, `'??'`), `'•'` for a folder holding changes; absent outside a repo. */
  git?: string
}

export type Preview = {
  path: string
  lines: string[]
  top: number
  /** Why the file shows partly or not at all (too large, binary, truncated); drawn above the code. */
  note: string | null
  mode: 'view' | 'edit'
  /** The edit cursor: a line index and a character index into it. */
  row: number
  col: number
  /** Edits not yet saved. */
  dirty: boolean
  /** The file's mtime when read or last saved: a save refuses to overwrite a newer file. */
  mtimeMs: number
  /** The file ended with a newline; it used CRLF line endings. Kept so a save writes the same shape. */
  eol: boolean
  crlf: boolean
  /** Why this file cannot be edited, or null when it can. */
  readOnly: string | null
  /** A one-line message for the person (saved, read-only, unsaved changes); drawn above the code. */
  status: string | null
  /** A second press confirms: leaving with unsaved edits, or saving over a newer file. */
  confirm: 'discard' | 'overwrite' | null
  /** How the file shows: as code, as rendered markdown (source on `m`), or as a picture. */
  kind?: 'text' | 'markdown' | 'image'
  mdView?: 'rendered' | 'source'
  /** A picture's PNG on disk (converted when the file is not a PNG) and its pixel size. */
  image?: { file: string; width: number; height: number } | null
}

/** The git repository the folder on screen belongs to: drawn as the project bar above the files. */
export type RepoInfo = {
  name: string
  branch: string
  ahead: number
  behind: number
  /** Files with unstaged changes or untracked; files with staged changes. */
  changed: number
  staged: number
  /** The touched view inside a repository: every file git reports changed, as paths from the explorer's root. */
  changedFiles: string[]
}

export type Explorer = {
  root: string
  dir: string
  entries: Entry[]
  cursor: number
  top: number
  filter: string
  isFiltering: boolean
  showHidden: boolean
  onlyTouched: boolean
  preview: Preview | null
  error: string | null
  /** The repository holding the folder on screen, or null outside git. */
  repo?: RepoInfo | null
}

/** A running subagent; it leaves the list when its turn completes. */
export type Agent = {
  id: string
  name: string
  type: string
  model: string
  task: string
  startedAt: number
  steps: number
  ctx: number
  out: number
  tools: number
  lastTool: string
  isBackground: boolean
}

declare module 'claude-code' {
  interface PluginState {
    strackzdevhub: {
      vitals: Vitals
      explorer: Explorer
      touched: Record<string, number>
      agents: Agent[]
      /** Bumped when git data for the open file arrives, so the pane redraws its gutter. */
      gitTick: number
    }
  }
}
