import { expect, test } from 'claude-code/testing'

import { MAX_FINISHED, describeTool, finishAgent, keepAgents, normalizeAgent, stepAgent } from '../../hooks/agents/agents'
import { agentLines } from '../../hooks/agents/view'

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

test('a finished agent moves to the history; the oldest finished ones go first, running ones never', () => {
  const running = normalizeAgent({ id: 'r', startedAt: 0 })
  const done = Array.from({ length: MAX_FINISHED + 3 }, (_, i) => normalizeAgent({ id: `d${i}`, startedAt: 0, endedAt: i }))
  const kept = keepAgents([running, ...done])
  expect(kept.length).toBe(MAX_FINISHED + 1)
  expect(kept[0]?.id).toBe('r')
  expect(kept[1]?.id).toBe('d3')
  const after = finishAgent([running], 'r', 4200)
  expect(after[0]?.endedAt).toBe(4200)
  // Finishing twice keeps the first time.
  expect(finishAgent(after, 'r', 9999)[0]?.endedAt).toBe(4200)
})

test('the agents tab: running cards first, then the finished ones, latest first', () => {
  const list = [
    normalizeAgent({ id: 'a', name: 'old', startedAt: 0, endedAt: 1000 }),
    normalizeAgent({ id: 'b', name: 'new', startedAt: 0, endedAt: 2000 }),
    normalizeAgent({ id: 'c', name: 'live', startedAt: 0, task: 'look' }),
  ]
  const kinds = agentLines(list).map(l => l.kind)
  expect(kinds).toEqual(['title', 'run', 'task', 'gap', 'title', 'done', 'done'])
  expect(agentLines(list).flatMap(l => (l.kind === 'done' ? [[l.name, l.ms]] : []))).toEqual([
    ['new', 2000],
    ['old', 1000],
  ])
})

test('an agent stored before the history existed (no endedAt) still finishes', () => {
  const stored = { ...normalizeAgent({ id: 'old' }), endedAt: undefined } as unknown as Parameters<typeof normalizeAgent>[0]
  const after = finishAgent([normalizeAgent(stored)], 'old', 500)
  expect(after[0]?.endedAt).toBe(500)
})
