import { expect, test } from 'claude-code/testing'

import { colFromVisual, reduceEdit, textOf, visualCol } from '../hooks/editor'
import { emptyPreview, previewOf } from '../hooks/explorer-state'

const doc = (lines: string[], row = 0, col = 0) => emptyPreview('a.ts', { lines, row, col, mode: 'edit' })
const type = (p: ReturnType<typeof doc>, ...keys: string[]) =>
  keys.reduce((x, key) => reduceEdit(x, { key }, 10).p, p)

test('typing, Enter with indentation, Backspace and Delete across lines', () => {
  let p = type(doc(['  foo'], 0, 5), 'b', 'a', 'r')
  expect(p.lines).toEqual(['  foobar'])
  expect(p.dirty).toBe(true)
  p = type(p, 'return', 'x')
  expect(p.lines).toEqual(['  foobar', '  x'])
  expect([p.row, p.col]).toEqual([1, 3])
  p = type(p, 'backspace', 'backspace', 'backspace', 'backspace')
  expect(p.lines).toEqual(['  foobar'])
  expect([p.row, p.col]).toEqual([0, 8])
  p = type(doc(['ab', 'cd'], 0, 2), 'delete')
  expect(p.lines).toEqual(['abcd'])
})

test('arrows wrap between lines and clamp to their length', () => {
  let p = type(doc(['abc', 'x'], 0, 3), 'right')
  expect([p.row, p.col]).toEqual([1, 0])
  p = type(p, 'left')
  expect([p.row, p.col]).toEqual([0, 3])
  p = type(doc(['abcdef', 'x'], 0, 5), 'down')
  expect([p.row, p.col]).toEqual([1, 1])
})

test('ctrl keys save, leave and undo; a paste inserts several lines', () => {
  expect(reduceEdit(doc(['a']), { key: 's', ctrl: true }, 10).effect).toBe('save')
  expect(reduceEdit(doc(['a']), { key: 'e', ctrl: true }, 10).effect).toBe('exit')
  expect(reduceEdit(doc(['a']), { key: 'z', ctrl: true }, 10).effect).toBe('undo')
  // ctrl+letter never types the letter.
  expect(reduceEdit(doc(['a']), { key: 'q', ctrl: true }, 10).p.lines).toEqual(['a'])
  const p = type(doc(['[]'], 0, 1), 'one\ntwo')
  expect(p.lines).toEqual(['[one', 'two]'])
})

test('a save writes the shape the file was read in', () => {
  const crlf = previewOf('w.txt', 'a\r\nb\r\n', 6)
  expect(crlf.readOnly).toBe(null)
  expect(textOf(crlf)).toBe('a\r\nb\r\n')
  const noEol = previewOf('n.txt', 'a\nb', 3)
  expect(textOf(noEol)).toBe('a\nb')
  expect(textOf(previewOf('e.txt', '', 0))).toBe('')
})

test('tabs: display columns and clicks map back to characters', () => {
  expect(visualCol('\tab', 1)).toBe(2)
  expect(colFromVisual('\tab', 0)).toBe(0)
  expect(colFromVisual('\tab', 1)).toBe(0)
  expect(colFromVisual('\tab', 2)).toBe(1)
  expect(colFromVisual('ab', 9)).toBe(2)
})
