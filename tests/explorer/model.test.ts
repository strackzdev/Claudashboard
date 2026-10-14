import { expect, test } from 'claude-code/testing'

import { DEFAULT_EXPLORER, emptyPreview, mentionOf, previewOf, reduceKey, selectLine, sortEntries, visibleEntries } from '../../hooks/explorer/model'
import type { Entry, Explorer } from '../../types'

const file = (path: string, kind: Entry['kind'] = 'file'): Entry => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind,
  size: 10,
  mtimeMs: 0,
})

const ex = (over: Partial<Explorer> = {}): Explorer => ({
  ...DEFAULT_EXPLORER,
  root: '/p',
  dir: 'src',
  entries: sortEntries([file('src/b.ts'), file('src/lib', 'dir'), file('src/.env'), file('src/a.ts')]),
  ...over,
})

test('folders sort first, dotfiles hide until toggled', () => {
  expect(visibleEntries(ex()).map(e => e.name)).toEqual(['lib', 'a.ts', 'b.ts'])
  const shown = reduceKey(ex(), { key: '.' }, 10).ex
  expect(visibleEntries(shown).map(e => e.name)).toEqual(['lib', '.env', 'a.ts', 'b.ts'])
})

test('arrows move within bounds; Enter opens the row under the cursor', () => {
  let s = ex()
  s = reduceKey(s, { key: 'up' }, 10).ex
  expect(s.cursor).toBe(0)
  for (let i = 0; i < 5; i++) s = reduceKey(s, { key: 'down' }, 10).ex
  expect(s.cursor).toBe(2)
  const r = reduceKey(s, { key: 'return' }, 10)
  expect(r.effect).toEqual({ kind: 'open', entry: file('src/b.ts') })
})

test('Backspace clears a filter first, then goes up', () => {
  let s = reduceKey(ex(), { key: '/' }, 10).ex
  expect(s.isFiltering).toBe(true)
  s = reduceKey(s, { key: 'a' }, 10).ex
  expect(visibleEntries(s).map(e => e.name)).toEqual(['a.ts'])
  s = reduceKey(s, { key: 'return' }, 10).ex
  expect(s.isFiltering).toBe(false)
  const cleared = reduceKey(s, { key: 'backspace' }, 10)
  expect(cleared.ex.filter).toBe('')
  expect(cleared.effect).toBe(null)
  expect(reduceKey(cleared.ex, { key: 'backspace' }, 10).effect).toEqual({ kind: 'up' })
})

test('in the preview, keys scroll within the file and Backspace goes back', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`)
  const s = ex({ preview: emptyPreview('src/a.ts', { lines }) })
  expect(reduceKey(s, { key: 'pagedown' }, 10).ex.preview?.top).toBe(9)
  expect(reduceKey(s, { key: 'end' }, 10).ex.preview?.top).toBe(40)
  expect(reduceKey(s, { key: 'up' }, 10).ex.preview?.top).toBe(0)
  expect(reduceKey(s, { key: 'backspace' }, 10).effect).toEqual({ kind: 'up' })
  expect(reduceKey(s, { key: 'h' }, 10).effect).toEqual({ kind: 'up' })
  // A note takes a row: the end scrolls one further so the last line shows.
  const noted = ex({ preview: emptyPreview('src/a.ts', { lines, note: 'n' }) })
  expect(reduceKey(noted, { key: 'end' }, 10).ex.preview?.top).toBe(41)
  expect(reduceKey(s, { key: '@' }, 10).effect).toEqual({ kind: 'mention', path: 'src/a.ts' })
})

test('previews refuse binaries and huge files, and strip control characters', () => {
  expect(previewOf('x.bin', 'ab\u0000cd', 5).lines).toEqual([])
  expect(previewOf('x.bin', 'ab\u0000cd', 5).note).toContain('binary')
  expect(previewOf('big', '', 5_000_000).note).toContain('too large')
  expect(previewOf('a.ts', 'one\r\ntwo\u001b[0m\n', 10).lines).toEqual(['one', 'two[0m'])
})

test('e opens the editor from the preview, and from the list on a file', () => {
  const s = ex({ preview: emptyPreview('src/a.ts', { lines: ['x'] }) })
  expect(reduceKey(s, { key: 'e' }, 10).effect).toEqual({ kind: 'edit' })
  const list = ex({ cursor: 1 })
  expect(reduceKey(list, { key: 'e' }, 10).effect).toEqual({ kind: 'open', entry: file('src/a.ts'), edit: true })
  // A folder has nothing to edit.
  expect(reduceKey(ex({ cursor: 0 }), { key: 'e' }, 10).effect).toBe(null)
})

test('files the preview had to alter are read-only', () => {
  expect(previewOf('c', 'x\u001by\n', 4).readOnly).toContain('control')
  expect(previewOf('m', 'a\r\nb\nc', 6).readOnly).toContain('mixed')
  expect(previewOf('r', 'a\rb', 3).readOnly).toContain('mixed')
  // Ordinary long lines (HTML, CSS) stay editable and whole; only minified-length lines are read-only.
  const html = previewOf('p.html', `${'x'.repeat(458)}\n`, 459)
  expect(html.readOnly).toBe(null)
  expect(html.lines[0]?.length).toBe(458)
  expect(previewOf('min.js', `a\n${'x'.repeat(10_001)}\n`, 10_003).readOnly).toBe('line 2 is longer than 10000 characters')
  expect(previewOf('b', 'a\u0000', 2).readOnly).toBe('binary file')
  expect(previewOf('ok.ts', 'const a = 1\n', 12).readOnly).toBe(null)
})

test('picking lines: a click selects one, shift or a drag stretches it, clicking the one line again clears', () => {
  let p = emptyPreview('a.ts', { lines: ['1', '2', '3', '4', '5'] })
  p = selectLine(p, 1, false)
  expect(p.sel).toEqual({ anchor: 1, head: 1 })
  p = selectLine(p, 3, true)
  expect(p.sel).toEqual({ anchor: 1, head: 3 })
  p = selectLine(p, 0, true)
  expect(p.sel).toEqual({ anchor: 1, head: 0 })
  p = selectLine(selectLine(p, 4, false), 4, false)
  expect(p.sel).toBe(null)
  expect(selectLine(p, 99, false).sel).toEqual({ anchor: 4, head: 4 })
  expect(mentionOf('src/a.ts', { anchor: 3, head: 1 })).toBe('src/a.ts#2-4')
  expect(mentionOf('src/a.ts', { anchor: 6, head: 6 })).toBe('src/a.ts#7-7')
  expect(mentionOf('src/a.ts', null)).toBe('src/a.ts')
})
