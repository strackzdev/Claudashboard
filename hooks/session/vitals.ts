// Pure logic for STRACKZDEVHUB: the session's vitals. No `$` here, so it is testable.
import type { Turn, Vitals } from '../../types'

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
  showTurns: false,
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

/** What the turns row shows: each series oldest first (null costs as 0), the latest turn's values and the averages. */
export function turnStats(turns: readonly Turn[]) {
  const known = turns.flatMap(t => (t.cost === null ? [] : [t.cost]))
  const last = turns[turns.length - 1]
  return {
    count: turns.length,
    costs: known.length ? turns.map(t => t.cost ?? 0) : null,
    lastCost: last?.cost ?? null,
    avgCost: known.length ? known.reduce((n, c) => n + c, 0) / known.length : null,
    times: turns.map(t => t.ms),
    lastMs: last?.ms ?? 0,
    avgMs: turns.reduce((n, t) => n + t.ms, 0) / Math.max(1, turns.length),
  }
}
