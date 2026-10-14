// Pure logic for STRACKZDEVHUB: the session's vitals. No `$` here, so it is testable.
import type { Turn, Vitals } from '../../types'
import { fmtDuration, fmtUsd } from '../shared/format'

export const DEFAULT_VITALS: Vitals = {
  model: '',
  effort: '',
  mode: 'default',
  pct: null,
  tokens: null,
  window: null,
  costUsd: null,
  limits: [],
  compactions: 0,
  turnStartedAt: null,
  turnCostStart: null,
  lastTurnMs: null,
  lastTurnCost: null,
  turns: [],
}

export type Usage = {
  context?: { percent?: number | null; tokens?: number | null; window?: number | null } | null
  cost?: { usd?: number | null } | null
  rateLimits?: Array<{ kind: string; percentUsed: number }> | null
}
/** The vitals a usage report (from `session.usage()` or `session.measure`) sets. */
export const usageToVitals = (u: Usage): Partial<Vitals> => ({
  pct: u.context?.percent ?? null,
  tokens: u.context?.tokens ?? null,
  window: u.context?.window ?? null,
  costUsd: u.cost?.usd ?? null,
  limits: (u.rateLimits ?? []).map(r => ({ kind: r.kind, pct: r.percentUsed })),
})

/** How many finished turns the sparkline keeps. */
export const MAX_TURNS = 16

/** The turns with `t` added last, the oldest dropped past MAX_TURNS. */
export const pushTurn = (turns: readonly Turn[], t: Turn): Turn[] => [...turns, t].slice(-MAX_TURNS)

/** How full the context is: 0 fine, 1 from 80%, 2 from 90% (time to compact). */
export function contextLevel(pct: number | null): 0 | 1 | 2 {
  if (pct === null) return 0
  return pct >= 90 ? 2 : pct >= 80 ? 1 : 0
}

/** The line beside the sparklines: how many turns, their average cost and length. */
export function turnSummary(turns: readonly Turn[]): string {
  const costs = turns.flatMap(t => (t.cost === null ? [] : [t.cost]))
  const avgMs = turns.reduce((n, t) => n + t.ms, 0) / Math.max(1, turns.length)
  const avgCost = costs.length ? ` · avg ${fmtUsd(costs.reduce((n, c) => n + c, 0) / costs.length)}` : ''
  return `${turns.length} turns${avgCost} · avg ${fmtDuration(avgMs)}`
}
