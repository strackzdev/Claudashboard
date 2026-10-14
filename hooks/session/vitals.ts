// Pure logic for STRACKZDEVHUB: the session's vitals. No `$` here, so it is testable.
import type { Vitals } from '../../types'

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
