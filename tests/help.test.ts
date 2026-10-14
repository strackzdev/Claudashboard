import { expect, test } from 'claude-code/testing'

import { helpLines, reduceHelp } from '../hooks/help'
import { DEFAULT_VIEW } from '../hooks/state'

test("the help starts with where the person is, then everywhere's keys", () => {
  const titles = (ctx: Parameters<typeof helpLines>[0]) => helpLines(ctx).flatMap(l => (l.kind === 'title' ? [l.text] : []))
  expect(titles('file').slice(0, 2)).toEqual(['File view', 'Everywhere'])
  expect(titles('agents')[0]).toBe('Agents')
  expect(helpLines('list').length).toBe(helpLines('diff').length)
})

test('arrows scroll the help within its lines; any other key closes it', () => {
  const v = { ...DEFAULT_VIEW, help: true }
  expect(reduceHelp(v, { key: 'down' }, 30, 10).helpTop).toBe(1)
  expect(reduceHelp({ ...v, helpTop: 20 }, { key: 'down' }, 30, 10).helpTop).toBe(20)
  expect(reduceHelp(v, { key: 'q' }, 30, 10)).toEqual({ ...v, help: false, helpTop: 0 })
})
