import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  DEFAULT_EXPLORER,
  normalizeAgent,
  describeTool,
  stepAgent,
  fmtAge,
  gauge,
  parentOf,
  prettyModel,
  previewOf,
  reduceKey,
  relTo,
  sortEntries,
  visibleEntries,
  windowTop,
} from '../hooks/core'
import type { Entry, Explorer } from '../types'

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

// ---------------------------------------------------------------- pure behaviour

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
  const s = ex({ preview: { path: 'src/a.ts', lines, top: 0, note: null } })
  expect(reduceKey(s, { key: 'pagedown' }, 10).ex.preview?.top).toBe(9)
  expect(reduceKey(s, { key: 'end' }, 10).ex.preview?.top).toBe(40)
  expect(reduceKey(s, { key: 'up' }, 10).ex.preview?.top).toBe(0)
  expect(reduceKey(s, { key: 'backspace' }, 10).effect).toEqual({ kind: 'up' })
  expect(reduceKey(s, { key: 'h' }, 10).effect).toEqual({ kind: 'up' })
  // A note takes a row: the end scrolls one further so the last line shows.
  const noted = ex({ preview: { path: 'src/a.ts', lines, top: 0, note: 'n' } })
  expect(reduceKey(noted, { key: 'end' }, 10).ex.preview?.top).toBe(41)
  expect(reduceKey(s, { key: '@' }, 10).effect).toEqual({ kind: 'mention', path: 'src/a.ts' })
})

test('previews refuse binaries and huge files, and strip control characters', () => {
  expect(previewOf('x.bin', 'ab\u0000cd', 5).lines).toEqual([])
  expect(previewOf('x.bin', 'ab\u0000cd', 5).note).toContain('binary')
  expect(previewOf('big', '', 5_000_000).note).toContain('too large')
  expect(previewOf('a.ts', 'one\r\ntwo\u001b[0m\n', 10).lines).toEqual(['one', 'two[0m'])
})

test('an agent stored by an older version still has every field', () => {
  const a = normalizeAgent({ id: 'x' })
  expect(a.task).toBe('')
  expect(a.steps).toBe(0)
})

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

// ---------------------------------------------------------------- drawing

const engine = (on: On) => {
  mock.clock(on)
}

const pane = (bodyColumns: number) => ({
  plugin: 'strackzdevhub',
  component: 'Pane' as const,
  requestId: 'strackzdevhub',
  props: {
    title: 'STRACKZDEVHUB',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
})

test('the pane draws the vitals on every surface and width', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [40, 72, 120]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      expect(await ui.find({ text: /effort/ })).toBeDefined()
      expect(await ui.find({ text: /^ctx/ })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('agent helpers: what a tool call does, and a step\'s usage', () => {
  expect(describeTool('Read', { file_path: '/p/src/a.ts' })).toBe('Read a.ts')
  expect(describeTool('Bash', { command: 'npm test\nmore' })).toBe('$ npm test')
  expect(describeTool('Grep', { pattern: 'TODO' })).toBe('Grep TODO')
  const a = stepAgent({ steps: 0, ctx: 0, out: 0, model: '' }, 'claude-haiku-5-5', { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 50 })
  expect(a).toEqual({ steps: 1, ctx: 1000, out: 50, model: 'claude-haiku-5-5' })
})

test('the agents section shows while agents run, and leaves with them', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'claude-haiku-5-5' }))
  on('turn.complete', () => ({ text: '' }))
  const before = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await before.find({ text: /^AGENTS/ })).toBeUndefined()
  await before.unmount()

  await $.agent.spawn({
    prompt: 'Find the auth middleware',
    description: 'Find the auth middleware',
    subagentType: 'Explore',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
  const during = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await during.find({ text: /AGENTS · 1 running/ })).toBeDefined()
  expect(await during.find({ text: /Find the auth middleware/ })).toBeDefined()
  await during.unmount()

  await $.turn.complete({ answer: 'found it', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' })
  const after = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await after.find({ text: /^AGENTS/ })).toBeUndefined()
  await after.unmount()
})
