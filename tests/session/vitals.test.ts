import { expect, test } from 'claude-code/testing'

import { MAX_TURNS, contextLevel, pushTurn, turnStats, usageToVitals } from '../../hooks/session/vitals'
import type { Turn } from '../../types'

test('a usage report sets the context, the cost and the limits; a missing part reads as unknown', () => {
  expect(
    usageToVitals({ context: { percent: 51, tokens: 102_000, window: 1_000_000 }, cost: { usd: 1.84 }, rateLimits: [{ kind: 'five_hour', percentUsed: 38 }] }),
  ).toEqual({ pct: 51, tokens: 102_000, window: 1_000_000, costUsd: 1.84, limits: [{ kind: 'five_hour', pct: 38 }] })
  expect(usageToVitals({})).toEqual({ pct: null, tokens: null, window: null, costUsd: null, limits: [] })
})

test('the context level: fine below 80%, filling from 80%, compact from 90%', () => {
  expect([null, 79.9, 80, 89, 90, 100].map(contextLevel)).toEqual([0, 0, 1, 1, 2, 2])
})

test('the turn history keeps the most recent turns and sums them up', () => {
  let turns: Turn[] = []
  for (let i = 0; i < MAX_TURNS + 3; i++) turns = pushTurn(turns, { ms: 1000 * (i + 1), cost: i % 2 ? 0.1 : null })
  expect(turns.length).toBe(MAX_TURNS)
  expect(turns[0]?.ms).toBe(4000)
  expect(
    turnStats([
      { ms: 30_000, cost: 0.1 },
      { ms: 90_000, cost: 0.3 },
    ]),
  ).toEqual({ count: 2, costs: [0.1, 0.3], lastCost: 0.3, avgCost: 0.2, times: [30_000, 90_000], lastMs: 90_000, avgMs: 60_000 })
  // No usage known: no cost series at all, rather than a row of zeros.
  expect(turnStats([{ ms: 5000, cost: null }]).costs).toBe(null)
})
