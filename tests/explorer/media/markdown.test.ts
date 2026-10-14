import { expect, test } from 'claude-code/testing'

import { fitColumns, inline, renderMarkdown, wrap } from '../../../hooks/explorer/media/markdown'

const text = (rows: ReturnType<typeof renderMarkdown>) => rows.map(r => r.spans.map(s => s.text).join(''))

test('inline markdown: code, bold, italic, links and images become styled spans', () => {
  expect(inline('a **b** _c_ `d` [e](http://x) ![f](g.png)')).toEqual([
    { text: 'a ', style: 'text' },
    { text: 'b', style: 'bold' },
    { text: ' ', style: 'text' },
    { text: 'c', style: 'italic' },
    { text: ' ', style: 'text' },
    { text: 'd', style: 'code' },
    { text: ' ', style: 'text' },
    { text: 'e', style: 'link' },
    { text: ' ', style: 'text' },
    { text: '🖼 f', style: 'dim' },
  ])
  // Underscores inside words stay text.
  expect(inline('snake_case_name')).toEqual([{ text: 'snake_case_name', style: 'text' }])
})

test('wrapping keeps words whole, cuts only a word longer than a row, and hangs a list item', () => {
  const rows = wrap([{ text: 'one two three four', style: 'text' }], 9).map(r => r.map(s => s.text).join(''))
  expect(rows).toEqual(['one two', 'three', 'four'])
  expect(wrap([{ text: 'abcdefghij', style: 'text' }], 4).map(r => r.map(s => s.text).join(''))).toEqual(['abcd', 'efgh', 'ij'])
  const item = wrap([{ text: 'alpha beta gamma', style: 'text' }], 10, [{ text: '• ', style: 'dim' }], [{ text: '  ', style: 'text' }])
  expect(item.map(r => r.map(s => s.text).join(''))).toEqual(['• alpha', '  beta', '  gamma'])
})

test('every row fits the width, whatever the block', () => {
  const md = [
    '# A title that is rather long for a narrow pane',
    'A paragraph written',
    'over two source lines.',
    '',
    '- a list item that wraps around the edge',
    '  1. nested',
    '> a quote',
    '```ts',
    'const veryLongName = someFunction(argumentOne, argumentTwo)',
    '```',
    '| Name | What it does |',
    '| --- | --- |',
    '| `f` | finds a file anywhere by the letters of its path |',
    '---',
  ]
  for (const width of [20, 40, 80]) {
    for (const row of text(renderMarkdown(md, width))) expect(row.length).toBeLessThanOrEqual(width)
  }
  // A paragraph's source lines join into one.
  expect(text(renderMarkdown(md, 80))).toContain('A paragraph written over two source lines.')
})

test('a table draws with borders and its columns lined up; too narrow, one cell per row', () => {
  const md = ['| a | b |', '|---|--:|', '| 1 | 22 |']
  expect(text(renderMarkdown(md, 40))).toEqual(['┌─────┬─────┐', '│ a   │   b │', '├─────┼─────┤', '│ 1   │  22 │', '└─────┴─────┘'])
  expect(text(renderMarkdown(md, 12))).toEqual(['a: 1', 'b: 22'])
})

test('columns share the room: narrow ones keep their width, the rest split what is left', () => {
  expect(fitColumns([3, 10], 20)).toEqual([3, 10])
  expect(fitColumns([3, 40, 40], 30)).toEqual([3, 14, 13])
})

test('every row knows its source line, so a view can switch between rendered and source in place', () => {
  const rows = renderMarkdown(['# T', '', 'para', '', '- x', '- y'], 40)
  expect(rows.map(r => [r.kind, r.src])).toEqual([
    ['h1', 0],
    ['h1', 0],
    ['blank', 2],
    ['text', 2],
    ['blank', 4],
    ['text', 4],
    ['text', 5],
  ])
})
