import { expect, test } from 'claude-code/testing'

import { windowTop } from '../hooks/explorer-state'
import { fmtAge, gauge, prettyModel } from '../hooks/format'
import { parentOf, relTo } from '../hooks/paths'

test('paths and formatting', () => {
  expect(relTo('/p', '/p/src/a.ts')).toBe('src/a.ts')
  expect(relTo('/p', '/elsewhere/a.ts')).toBe('/elsewhere/a.ts')
  expect(parentOf('src/lib/x')).toBe('src/lib')
  expect(parentOf('src')).toBe('')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('opus 5.5')
  expect(gauge(50, 10)).toBe('▰▰▰▰▰▱▱▱▱▱')
  expect(fmtAge(10_000)).toBe('just now')
  expect(windowTop(0, 100, 10)).toBe(0)
  expect(windowTop(99, 100, 10)).toBe(90)
})
