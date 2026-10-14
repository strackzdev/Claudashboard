import { expect, test } from 'claude-code/testing'

import { findFiles, fuzzyMatch, reduceFinder } from '../../hooks/explorer/finder'
import type { Finder } from '../../types'

const files = ['src/auth/middleware.ts', 'src/main.ts', 'docs/middle-earth.md', 'tests/auth.test.ts', 'README.md']

test("a match needs the query's letters in order, case ignored", () => {
  expect(fuzzyMatch('MDW', 'src/auth/middleware.ts')?.hits).toEqual([9, 11, 15])
  expect(fuzzyMatch('wdm', 'src/auth/middleware.ts')).toBe(null)
})

test("the file's own name outranks letters spread over folders, a name's start outranks its middle", () => {
  expect(findFiles(files, 'auth').map(m => m.path)[0]).toBe('tests/auth.test.ts')
  expect(findFiles(files, 'main')[0]?.path).toBe('src/main.ts')
  expect(findFiles(files, 'middle').map(m => m.path)).toEqual(['docs/middle-earth.md', 'src/auth/middleware.ts'])
})

test('no query lists the files as they are; a query without a match finds nothing', () => {
  expect(findFiles(files, '').length).toBe(files.length)
  expect(findFiles(files, 'zzz')).toEqual([])
})

test('finder keys: type, move, Enter opens the pick, Backspace on an empty query closes', () => {
  const f: Finder = { query: '', cursor: 0, files, isLoading: false }
  let r = reduceFinder(f, { key: 'm' }, 10)
  r = reduceFinder(r.finder, { key: 'a' }, 10)
  expect(r.finder.query).toBe('ma')
  r = reduceFinder(r.finder, { key: 'down' }, 10)
  expect(r.finder.cursor).toBe(1)
  const picked = findFiles(files, 'ma')[1]?.path
  expect(reduceFinder(r.finder, { key: 'return' }, 10).effect).toEqual({ kind: 'open', path: picked })
  expect(reduceFinder({ ...f, query: 'x' }, { key: 'u', ctrl: true }, 10).finder.query).toBe('')
  expect(reduceFinder(f, { key: 'backspace' }, 10).effect).toEqual({ kind: 'close' })
})
