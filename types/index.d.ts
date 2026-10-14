export type Limit = { kind: string; pct: number }

/** One row of the diff view: a hunk header, a line both sides share, or one only the old or new side has. */
export type DiffRow = { kind: 'hunk' | 'ctx' | 'add' | 'del'; text: string; old: number | null; new: number | null }

/** What a tool call does to a file: `read` (Read) or `edit` (Edit, Write, MultiEdit, NotebookEdit). */
export type Activity = 'read' | 'edit'

/** One finished turn of the main loop: how long it ran and what it cost (null when usage was unknown). */
export type Turn = { ms: number; cost: number | null }

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
  /** The most recent turns, oldest first, for the sparkline. */
  turns: Turn[]
  /** Whether the session box draws the turns row: `/strackzdevhub turns`, remembered across sessions. */
  showTurns: boolean
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
  /** The diff view (`d`): the file's changes against git's HEAD (or the text as first opened, outside git), and where the file view was scrolled. */
  diff?: { rows: DiffRow[]; fileTop: number } | null
  /** Lines picked in the view (a click, then shift+click or a drag), 0-based: where it started and where it ends now. */
  sel?: { anchor: number; head: number } | null
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
      /** What Claude (or a subagent) does with each file this turn, by its path from the root; cleared when the turn ends. */
      activity: Record<string, Activity>
      agents: Agent[]
      /** Bumped when git data for the open file arrives, so the pane redraws its gutter. */
      gitTick: number
    }
  }
}
