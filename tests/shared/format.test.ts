import { expect, test } from 'claude-code/testing'

import { windowTop } from '../../hooks/explorer/model'
import { fmtAge, gauge, prettyModel } from '../../hooks/shared/format'
import { isAbsolute, parentOf, relTo, toSlash } from '../../hooks/shared/paths'

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

test('Windows paths: backslashes become slashes, a drive letter is absolute', () => {
  const root = toSlash('C:\\Users\\me\\proj')
  expect(root).toBe('C:/Users/me/proj')
  expect(relTo(root, toSlash('C:\\Users\\me\\proj\\src\\a.ts'))).toBe('src/a.ts')
  expect(isAbsolute('C:/x')).toBe(true)
  expect(isAbsolute('/x')).toBe(true)
  expect(isAbsolute('src/x')).toBe(false)
})
