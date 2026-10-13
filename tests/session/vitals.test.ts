import { expect, test } from 'claude-code/testing'

import { usageToVitals } from '../../hooks/session/vitals'

test('a usage report sets the context, the cost and the limits; a missing part reads as unknown', () => {
  expect(
    usageToVitals({ context: { percent: 51, tokens: 102_000, window: 1_000_000 }, cost: { usd: 1.84 }, rateLimits: [{ kind: 'five_hour', percentUsed: 38 }] }),
  ).toEqual({ pct: 51, tokens: 102_000, window: 1_000_000, costUsd: 1.84, limits: [{ kind: 'five_hour', pct: 38 }] })
  expect(usageToVitals({})).toEqual({ pct: null, tokens: null, window: null, costUsd: null, limits: [] })
})
