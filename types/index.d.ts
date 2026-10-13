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
export type Entry = { name: string; path: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number }

export type Preview = {
  path: string
  lines: string[]
  top: number
  note: string | null
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
    jopinhub: {
      vitals: Vitals
      explorer: Explorer
      touched: Record<string, number>
      agents: Agent[]
    }
  }
}
