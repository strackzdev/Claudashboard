import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  DEFAULT_EXPLORER,
  emptyPreview,
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
import { colFromVisual, reduceEdit, textOf, visualCol } from '../hooks/editor'
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

// ---------------------------------------------------------------- editing

const doc = (lines: string[], row = 0, col = 0) => emptyPreview('a.ts', { lines, row, col, mode: 'edit' })
const type = (p: ReturnType<typeof doc>, ...keys: string[]) =>
  keys.reduce((x, key) => reduceEdit(x, { key }, 10).p, p)

test('e opens the editor from the preview, and from the list on a file', () => {
  const s = ex({ preview: emptyPreview('src/a.ts', { lines: ['x'] }) })
  expect(reduceKey(s, { key: 'e' }, 10).effect).toEqual({ kind: 'edit' })
  const list = ex({ cursor: 1 })
  expect(reduceKey(list, { key: 'e' }, 10).effect).toEqual({ kind: 'open', entry: file('src/a.ts'), edit: true })
  // A folder has nothing to edit.
  expect(reduceKey(ex({ cursor: 0 }), { key: 'e' }, 10).effect).toBe(null)
})

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

test('files the preview had to alter are read-only', () => {
  expect(previewOf('c', 'x\u001by\n', 4).readOnly).toContain('control')
  expect(previewOf('m', 'a\r\nb\nc', 6).readOnly).toContain('mixed')
  expect(previewOf('r', 'a\rb', 3).readOnly).toContain('mixed')
  expect(previewOf('l', `${'x'.repeat(500)}\n`, 501).readOnly).toContain('longer than')
  expect(previewOf('b', 'a\u0000', 2).readOnly).toBe('binary file')
  expect(previewOf('ok.ts', 'const a = 1\n', 12).readOnly).toBe(null)
})

test('tabs: display columns and clicks map back to characters', () => {
  expect(visualCol('\tab', 1)).toBe(2)
  expect(colFromVisual('\tab', 0)).toBe(0)
  expect(colFromVisual('\tab', 1)).toBe(0)
  expect(colFromVisual('\tab', 2)).toBe(1)
  expect(colFromVisual('ab', 9)).toBe(2)
})

// ---------------------------------------------------------------- editing, end to end

/** An in-memory folder `/w` with one file, standing in for the engine's file system. */
const disk = (on: On, files: Record<string, string>) => {
  const mtimes: Record<string, number> = Object.fromEntries(Object.keys(files).map(f => [f, 1000]))
  on('session.cwd', () => ({ value: '/w' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('fs.list', () => ({
    value: Object.keys(files).map(name => ({ name: name.slice(3), kind: 'file' as const, size: files[name]?.length ?? 0, mtimeMs: 1000, isLink: false })),
  }))
  on('fs.stat', (_$, e) => ({ value: { kind: 'file' as const, size: files[e.path]?.length ?? 0, mtimeMs: mtimes[e.path] ?? 0, isLink: false } }))
  on('fs.read', (_$, e) => ({ value: files[e.path] ?? '' }))
  on('fs.write', (_$, e) => {
    files[e.path] = e.text
    mtimes[e.path] = (mtimes[e.path] ?? 0) + 1000
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  // Another writer (Claude, an editor) changing a file: new text, newer mtime.
  Object.defineProperty(files, 'writeOutside', {
    enumerable: false,
    value: (path: string, text: string) => {
      files[path] = text
      mtimes[path] = (mtimes[path] ?? 0) + 5000
    },
  })
  return files as Record<string, string> & { writeOutside: (path: string, text: string) => void }
}

/** The props the pane handed the explorer client in the drawing now on screen. */
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
async function explorerProps(ui: { drawn: () => Promise<unknown> }): Promise<Record<string, unknown>> {
  const walk = (n: unknown): Record<string, unknown> | undefined => {
    const node = n as Node
    if (!node || typeof node !== 'object') return undefined
    if (node.type === 'Client' && node.props?.key === 'explorer') return node.props.props as Record<string, unknown>
    for (const c of node.children ?? []) {
      const found = walk(c)
      if (found) return found
    }
    return undefined
  }
  return walk(await ui.drawn()) ?? {}
}

test('open a file, press e, type, ctrl+s: the file on disk changes and the label says so', async ($, on) => {
  engine(on)
  const files = disk(on, { '/w/a.ts': 'const a = 1\n' })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 'return', in: 'explorer' }) // open a.ts
  const viewing = await explorerProps(ui)
  expect(viewing.fileMode).toBe('view')
  expect(JSON.stringify(viewing.hints)).toContain('"key":"e","label":"edit"')
  await ui.key({ key: 'e', in: 'explorer' })
  expect((await explorerProps(ui)).fileMode).toBe('edit')
  await ui.key({ key: 'end', in: 'explorer' })
  await ui.key({ key: '0', in: 'explorer' })
  expect((await explorerProps(ui)).isDirty).toBe(true)
  await ui.key({ key: 's', ctrl: true, in: 'explorer' })
  expect(files['/w/a.ts']).toBe('const a = 10\n')
  const after = await explorerProps(ui)
  expect(after.isDirty).toBe(false)
  expect(after.note).toBe('saved ✓')
  await ui.key({ key: 'e', ctrl: true, in: 'explorer' })
  expect((await explorerProps(ui)).fileMode).toBe('view')
  await ui.unmount()
})

test('leaving with unsaved edits asks first; a second ctrl+e discards them', async ($, on) => {
  engine(on)
  const files = disk(on, { '/w/a.ts': 'x\n' })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 'e', in: 'explorer' }) // from the list: open straight into edit mode
  expect((await explorerProps(ui)).fileMode).toBe('edit')
  await ui.key({ key: 'y', in: 'explorer' })
  await ui.key({ key: 'e', ctrl: true, in: 'explorer' })
  const warned = await explorerProps(ui)
  expect(String(warned.note)).toContain('unsaved changes')
  expect(warned.fileMode).toBe('edit')
  await ui.key({ key: 'e', ctrl: true, in: 'explorer' })
  expect((await explorerProps(ui)).fileMode).toBe('view')
  expect(files['/w/a.ts']).toBe('x\n')
  await ui.unmount()
})

test('a save refuses to overwrite a file changed on disk until pressed again', async ($, on) => {
  engine(on)
  const files = disk(on, { '/w/a.ts': 'x\n' })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 'e', in: 'explorer' })
  await ui.key({ key: 'y', in: 'explorer' })
  // Someone else writes the file meanwhile.
  files.writeOutside('/w/a.ts', 'theirs\n')
  await ui.key({ key: 's', ctrl: true, in: 'explorer' })
  expect(files['/w/a.ts']).toBe('theirs\n')
  expect(String((await explorerProps(ui)).note)).toContain('changed on disk')
  await ui.key({ key: 's', ctrl: true, in: 'explorer' })
  expect(files['/w/a.ts']).toBe('yx\n')
  await ui.unmount()
})
