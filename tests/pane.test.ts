import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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
    for (const cols of [24, 30, 40, 72, 120]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      expect(await ui.find({ text: /effort/ })).toBeDefined()
      expect(await ui.find({ text: /^ctx/ })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('the context alarm: the box warns from 80%, says to compact from 90%, and toasts once per threshold', async ($, on) => {
  engine(on)
  const toasts: string[] = []
  const status: Array<string | undefined> = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('session.measure', () => ({ changed: [] }))
  const measure = (percent: number) => $.session.measure({ context: { percent, tokens: percent * 1000, window: 100_000 }, rateLimits: [] } as never)
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await measure(85)
  expect(await ui.find({ text: /filling up/ })).toBeDefined()
  await measure(88)
  await measure(92)
  expect(await ui.find({ text: /compact soon/ })).toBeDefined()
  expect(toasts).toEqual(['Context 85% full', 'Context 92% full: run /compact soon'])
  expect(status.at(-1)).toBe('⚠ context 92%: compact soon')
  // After a compaction the alarm clears.
  await measure(30)
  expect(status.at(-1)).toBe(undefined)
  expect(await ui.find({ text: /compact soon/ })).toBeUndefined()
  await ui.unmount()
})

test('a finished turn adds to the turns row: its length as a sparkline', async ($, on) => {
  const clock = mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const before = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await before.find({ text: /^turn $/ })).toBeUndefined()
  await before.unmount()
  await $.turn.start({ turnId: 't1', text: 'hello' } as never)
  await clock.advance(42_000)
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 42_000, isAborted: false, reason: 'answer' })
  const after = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await after.find({ text: /1 turns · avg 0:42/ })).toBeDefined()
  await after.unmount()
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

// ---------------------------------------------------------------- git gutter

/** A repository at /w where a.ts is committed as `committed`, and the index as given. */
const repo = (on: On, committed: string, staged: string, status: string) => {
  const out = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', (_$, e) => {
    const args = e.argv.slice(3).join(' ')
    if (args === 'rev-parse --show-toplevel') return out(0, '/w\n')
    if (args === 'show HEAD:a.ts') return out(0, committed)
    if (args === 'show :a.ts') return out(0, staged)
    if (args.startsWith('status')) return out(0, status)
    return out(1, '')
  })
}

test('in a repo, the list shows git letters and the file shows its changed lines', async ($, on) => {
  engine(on)
  disk(on, { '/w/a.ts': 'one\nTWO\nthree\n' })
  repo(on, 'one\ntwo\nthree\n', 'one\ntwo\nthree\n', ' M a.ts\0')
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  const listed = await explorerProps(ui)
  expect((listed.rows as Array<{ git: unknown }>)[0]?.git).toEqual({ letter: 'M', tone: 'modified' })
  await ui.key({ key: 'return', in: 'explorer' })
  const viewed = await explorerProps(ui)
  expect(viewed.gutter).toEqual([null, { glyph: '▌', tone: 'modified' }, null])
  expect((viewed.changes as { modified: number }).modified).toBe(1)
  // Blank lines stay one row each, so the gutter lines up with the text.
  expect((viewed.code as { source: string }).source.split('\n')).toHaveLength(3)
  // Edit line 1 without saving: it shows as unsaved.
  await ui.key({ key: 'e', in: 'explorer' })
  await ui.key({ key: 'x', in: 'explorer' })
  const edited = await explorerProps(ui)
  expect((edited.gutter as unknown[])[0]).toEqual({ glyph: '▌', tone: 'unsaved' })
  expect((edited.changes as { unsaved: number }).unsaved).toBe(1)
  await ui.unmount()
})

test('a file edited in another editor shows as changed without any action', async ($, on) => {
  const clock = mock.clock(on)
  const files = disk(on, { '/w/a.ts': 'one\n' })
  let status = ''
  const out = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', (_$, e) => {
    const args = e.argv.slice(3).join(' ')
    if (args === 'rev-parse --show-toplevel') return out(0, '/w\n')
    if (args.startsWith('status')) return out(0, `## main\0${status}`)
    if (args === 'show HEAD:a.ts' || args === 'show :a.ts') return out(0, 'one\n')
    return out(1, '')
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect((await explorerProps(ui)).rows).toEqual([expect.objectContaining({ git: null })])
  // Someone edits a.ts elsewhere: on the next tick the list says so.
  files.writeOutside('/w/a.ts', 'one\ntwo\n')
  status = ' M a.ts\0'
  await clock.advance(3000)
  expect((await explorerProps(ui)).rows).toEqual([expect.objectContaining({ git: { letter: 'M', tone: 'modified' } })])
  await ui.unmount()
})

test('a live refresh keeps the cursor on the same file while dotfiles are hidden', async ($, on) => {
  const clock = mock.clock(on)
  const files = disk(on, { '/w/.env': 'x', '/w/a.ts': 'a', '/w/b.ts': 'b' })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 'down', in: 'explorer' }) // onto b.ts
  files.writeOutside('/w/c.ts', 'c')
  await clock.advance(3000)
  const rows = (await explorerProps(ui)).rows as Array<{ label: string; isSelected: boolean }>
  expect(rows.find(r => r.isSelected)?.label).toBe('b.ts')
  await ui.unmount()
})

test("d shows the open file's changes against HEAD, and d again goes back to the file", async ($, on) => {
  engine(on)
  disk(on, { '/w/a.ts': 'one\nTWO\nthree\n' })
  repo(on, 'one\ntwo\nthree\n', 'one\ntwo\nthree\n', ' M a.ts\0')
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 'return', in: 'explorer' })
  await ui.key({ key: 'd', in: 'explorer' })
  const diff = await explorerProps(ui)
  expect((diff.diff as Array<{ kind: string; text: string }>).map(r => `${r.kind} ${r.text}`)).toEqual([
    'hunk @@ -1,3 +1,3 @@',
    'ctx one',
    'del two',
    'add TWO',
    'ctx three',
  ])
  expect((diff.crumbs as string[]).at(-1)).toBe('a.ts · diff')
  await ui.key({ key: 'd', in: 'explorer' })
  const back = await explorerProps(ui)
  expect(back.diff).toBe(null)
  expect(back.code).not.toBe(null)
  await ui.unmount()
})

test('in a repo, touched follows git: your own change shows, a revert or commit clears it', async ($, on) => {
  const clock = mock.clock(on)
  disk(on, { '/w/a.ts': 'a', '/w/b.ts': 'b' })
  let status = ''
  const out = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', (_$, e) => {
    const args = e.argv.slice(3).join(' ')
    if (args === 'rev-parse --show-toplevel') return out(0, '/w\n')
    if (args.startsWith('status')) return out(0, `## main\0${status}`)
    return out(1, '')
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 't', in: 'explorer' })
  expect((await explorerProps(ui)).empty).toBe('Nothing changed: the files match the last commit.')
  // Edited outside Claude: git sees it, so it is touched.
  status = ' M b.ts\0'
  await clock.advance(3000)
  const touched = await explorerProps(ui)
  expect((touched.rows as Array<{ label: string; isTouched: boolean }>).map(r => [r.label, r.isTouched])).toEqual([['b.ts', true]])
  // Reverted (or committed): git is clean again, so nothing is touched.
  status = ''
  await clock.advance(3000)
  expect((await explorerProps(ui)).rows).toEqual([])
  await ui.unmount()
})

test('the mode tag follows a switch without a new prompt: the end of a turn carries the mode', async ($, on) => {
  engine(on)
  disk(on, { '/w/a.ts': 'a' })
  // The engine's own side of the classic hooks: nothing to add.
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.Stop', () => ({}))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'auto' } as never)
  expect(await ui.find({ text: /^auto$/ })).toBeDefined()
  // Shift+Tab to plan mid-turn: the turn's end reports the new mode.
  await $.classic.Stop({ permission_mode: 'plan', stop_hook_active: false } as never)
  expect(await ui.find({ text: /^plan$/ })).toBeDefined()
  // A subagent's events never change the main loop's tag.
  await $.classic.Stop({ permission_mode: 'acceptEdits', agent_id: 'a1', stop_hook_active: false } as never)
  expect(await ui.find({ text: /^plan$/ })).toBeDefined()
  await ui.unmount()
})

test('the file tree shows what Claude reads and edits during a turn, and clears when it ends', async ($, on) => {
  engine(on)
  disk(on, { '/w/a.ts': 'a', '/w/b.ts': 'b', '/w/c.ts': 'c' })
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.turn.start({ turnId: 't1', text: 'hello' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/w/a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/w/b.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/w/b.ts', old_string: 'b', new_string: 'B' } as never)
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  const rows = (await explorerProps(ui)).rows as Array<{ label: string; activity: string | null }>
  expect(rows.map(r => [r.label, r.activity])).toEqual([
    ['a.ts', 'read'],
    ['b.ts', 'edit'],
    ['c.ts', null],
  ])
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
  const after = (await explorerProps(ui)).rows as Array<{ activity: string | null }>
  expect(after.every(r => r.activity === null)).toBe(true)
  await ui.unmount()
})

test('the pane stays drawn while a turn runs (its live timer is a valid tree)', async ($, on) => {
  engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await $.turn.start({ turnId: 't1', text: 'hello' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane(80), surface })
    expect(await ui.find({ text: /^SESSION$/ })).toBeDefined()
    await ui.unmount()
  }
})

// ---------------------------------------------------------------- markdown and pictures

test('a markdown file opens rendered; m shows its source with the gutter', async ($, on) => {
  engine(on)
  disk(on, { '/w/README.md': '# Hello\n\nSome **bold** text.\n' })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.key({ key: 'return', in: 'explorer' })
  const rendered = await explorerProps(ui)
  expect(rendered.markdown).toBe('# Hello\n\nSome **bold** text.')
  expect(rendered.code).toBe(null)
  expect(JSON.stringify(rendered.hints)).toContain('"key":"m","label":"source"')
  await ui.key({ key: 'm', in: 'explorer' })
  const source = await explorerProps(ui)
  expect(source.markdown).toBe(null)
  expect((source.code as { source: string }).source).toContain('# Hello')
  // Editing works on the source, and leaving the editor shows it rendered again.
  await ui.key({ key: 'm', in: 'explorer' })
  await ui.key({ key: 'e', in: 'explorer' })
  expect((await explorerProps(ui)).fileMode).toBe('edit')
  await ui.key({ key: 'e', ctrl: true, in: 'explorer' })
  expect((await explorerProps(ui)).markdown).toContain('# Hello')
  await ui.unmount()
})
