import { expect, test } from 'claude-code/testing'

import { describeTool, normalizeAgent, stepAgent } from '../hooks/agents'

test('an agent stored by an older version still has every field', () => {
  const a = normalizeAgent({ id: 'x' })
  expect(a.task).toBe('')
  expect(a.steps).toBe(0)
})

test("agent helpers: what a tool call does, and a step's usage", () => {
  expect(describeTool('Read', { file_path: '/p/src/a.ts' })).toBe('Read a.ts')
  expect(describeTool('Bash', { command: 'npm test\nmore' })).toBe('$ npm test')
  expect(describeTool('Grep', { pattern: 'TODO' })).toBe('Grep TODO')
  const a = stepAgent({ steps: 0, ctx: 0, out: 0, model: '' }, 'claude-haiku-5-5', { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 50 })
  expect(a).toEqual({ steps: 1, ctx: 1000, out: 50, model: 'claude-haiku-5-5' })
})
