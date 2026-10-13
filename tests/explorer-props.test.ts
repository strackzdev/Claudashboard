import { expect, test } from 'claude-code/testing'

import { explorerProps } from '../hooks/explorer-props'
import { DEFAULT_EXPLORER, emptyPreview } from '../hooks/explorer-state'
import type { Palette } from '../hooks/explorer'
import type { Explorer } from '../types'

const colors = {} as Palette
const props = (ex: Partial<Explorer>, over: Partial<Parameters<typeof explorerProps>[0]> = {}) =>
  explorerProps({ ex: { ...DEFAULT_EXPLORER, root: '/p', ...ex }, touched: {}, now: 0, room: 10, width: 70, colors, base: null, disk: null, ...over })

test('the list: a row per visible entry, the cursor counted, touched files marked', () => {
  const entries = [
    { name: 'lib', path: 'lib', kind: 'dir' as const, size: 0, mtimeMs: 0, git: '•' },
    { name: 'a.ts', path: 'a.ts', kind: 'file' as const, size: 10, mtimeMs: 0, git: ' M' },
  ]
  const p = props({ entries, cursor: 1 }, { touched: { 'a.ts': 2 } })
  expect(p.mode).toBe('list')
  expect(p.counter).toBe('2/2')
  expect(p.rows.map(r => [r.label, r.isSelected, r.isTouched, r.git?.letter])).toEqual([
    ['lib/', false, false, '•'],
    ['a.ts', true, true, 'M'],
  ])
  expect(p.hints.find(h => h.key === 't')?.label).toBe('touched (1)')
})

test('an empty list says why', () => {
  expect(props({}).empty).toBe('Empty folder.')
  expect(props({ filter: 'zz', entries: [{ name: 'a', path: 'a', kind: 'file', size: 0, mtimeMs: 0 }] }).empty).toBe('Nothing matches the filter.')
  expect(props({ onlyTouched: true }).empty).toBe('No files touched yet this session.')
})

test('the open file: its lines in view, the counter, and a gutter against its base', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
  const preview = emptyPreview('a.ts', { lines })
  const base = { repo: true, head: lines.slice(1), index: lines.slice(1) }
  const p = props({ preview }, { base, disk: lines })
  expect(p.mode).toBe('preview')
  expect(p.counter).toBe('1–10 / 30')
  expect(p.code?.startLine).toBe(1)
  expect(p.gutter?.[0]).toEqual({ glyph: '▌', tone: 'added' })
  expect(p.fileMode).toBe('view')
})

test('editing shows the cursor position; a picture shows its size', () => {
  const editing = props({ preview: emptyPreview('a.ts', { lines: ['abc'], mode: 'edit', col: 2 }) })
  expect(editing.counter).toBe('Ln 1, Col 3')
  expect(editing.edit?.cursorVis).toBe(2)
  const pic = props({ preview: emptyPreview('a.png', { kind: 'image', image: { file: '/p/a.png', width: 640, height: 480 } }) })
  expect(pic.counter).toBe('640×480 px')
  expect(pic.fileMode).toBe(null)
})
