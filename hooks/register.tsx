// STRACKZDEVHUB: session vitals, running subagents, and a file explorer with an in-pane preview.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Entry, Explorer, Preview, Vitals } from '../types'
import {
  DEFAULT_EXPLORER,
  DEFAULT_VITALS,
  EFFORT_LEVEL,
  MAX_DRAWN,
  baseName,
  clipEnd,
  describeTool,
  fmtAge,
  fmtDuration,
  fmtSize,
  fmtTokens,
  fmtUsd,
  gauge,
  hasLongContext,
  joinPath,
  limitLabel,
  modeColorKey,
  emptyPreview,
  hasNoteRow,
  normalize,
  normalizeAgent,
  parentOf,
  prettyModel,
  previewOf,
  reduceKey,
  relTo,
  sortEntries,
  stepAgent,
  touchedEntries,
  visibleEntries,
  windowTop,
} from './core'
import { colFromVisual, displayOf, reduceEdit, textOf, visualCol } from './editor'
import type { ExplorerProps, Hint, Palette } from './explorer'

const PANE = 'strackzdevhub'
const TITLE = 'STRACKZDEVHUB'
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** Agents drawn before the rest fold into `+n more`. */
const MAX_AGENTS = 4

const vitals = atom({ plugin: 'strackzdevhub', key: 'vitals' } as const, DEFAULT_VITALS)
const explorer = atom({ plugin: 'strackzdevhub', key: 'explorer' } as const, DEFAULT_EXPLORER)
const touched = atom({ plugin: 'strackzdevhub', key: 'touched' } as const, {})
const agents = atom({ plugin: 'strackzdevhub', key: 'agents' } as const, [] as Agent[])

type Colors = Palette & { ok: string; bad: string; info: string; purple: string; frame: string }

const ONE_DARK: Colors = {
  accent: '#61afef',
  dir: '#61afef',
  touched: '#e5c07b',
  dim: '#5c6370',
  text: '#abb2bf',
  selectedBg: '#3e4451',
  hoverBg: '#2c313a',
  warn: '#e5c07b',
  ok: '#98c379',
  bad: '#e06c75',
  info: '#56b6c2',
  purple: '#c678dd',
  frame: '#4b5263',
  pillFg: '#282c34',
}

const THEME: Colors = {
  accent: 'claude',
  dir: 'suggestion',
  touched: 'warning',
  dim: 'inactive',
  text: 'text',
  selectedBg: 'subtle',
  hoverBg: 'subtle',
  warn: 'warning',
  ok: 'success',
  bad: 'error',
  info: 'suggestion',
  purple: 'permission',
  frame: 'inactive',
  pillFg: 'inverseText',
}

const getVitals = async ($: EngineInterface) => normalize(DEFAULT_VITALS, await read($, vitals))
const getExplorer = async ($: EngineInterface): Promise<Explorer> => {
  const ex = normalize(DEFAULT_EXPLORER, await read($, explorer))
  // A preview stored by an older version lacks the editor's fields.
  return ex.preview ? { ...ex, preview: emptyPreview(ex.preview.path, ex.preview) } : ex
}

/** Undo steps per file, newest last, and the text as last read or saved; the module's own, so a reload drops them. */
const history = new Map<string, Array<Pick<Preview, 'lines' | 'row' | 'col'>>>()
const saved = new Map<string, string[]>()
const MAX_UNDO = 100

const setPreview = ($: EngineInterface, fn: (p: Preview) => Preview) =>
  update($, explorer, x => {
    const ex = normalize(DEFAULT_EXPLORER, x)
    return ex.preview ? { ...ex, preview: fn(emptyPreview(ex.preview.path, ex.preview)) } : ex
  })
const getTouched = async ($: EngineInterface): Promise<Record<string, number>> => (await read($, touched)) ?? {}
const getAgents = async ($: EngineInterface): Promise<Agent[]> => {
  const list = await read($, agents)
  return Array.isArray(list) ? list.map(a => normalizeAgent(a)) : []
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE, columns: 76, rows: 30 })

async function listDir($: EngineInterface, root: string, dir: string): Promise<Entry[]> {
  const raw = await $.fs.list(joinPath(root, dir))
  const entries = await Promise.all(
    raw.map(async r => {
      const path = dir ? `${dir}/${r.name}` : r.name
      let kind = r.kind
      // A symbolic link lists as `other`: show it as what it leads to.
      if (r.isLink) {
        const s = await $.fs.stat(joinPath(root, path)).catch(() => undefined)
        if (s) kind = s.kind
      }
      return { name: r.name, path, kind, size: r.size, mtimeMs: r.mtimeMs }
    }),
  )
  return sortEntries(entries)
}

/** Loads `dir` into the explorer, the cursor on `select` when it is there. */
async function loadDir($: EngineInterface, dir: string, select?: string) {
  const ex = await getExplorer($)
  try {
    const entries = ex.onlyTouched ? touchedEntries(await getTouched($)) : await listDir($, ex.root, dir)
    await update($, explorer, x => {
      const next: Explorer = { ...normalize(DEFAULT_EXPLORER, x), dir, entries, preview: null, error: null, cursor: 0 }
      const at = select ? visibleEntries(next).findIndex(e => e.path === select) : -1
      return { ...next, cursor: Math.max(0, at) }
    })
  } catch (err) {
    await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), error: `cannot open ${dir || '.'}: ${String(err)}` }))
  }
}

const absOf = (root: string, path: string) => (path.startsWith('/') ? path : joinPath(root, path))

/** Reads `path` into the preview; `keep` carries the mode, cursor and scroll over a reload. */
async function loadPreview($: EngineInterface, path: string, keep: Partial<Preview> = {}) {
  const ex = await getExplorer($)
  const abs = absOf(ex.root, path)
  try {
    const st = await $.fs.stat(abs)
    const text = st.size > 1024 * 1024 ? '' : await $.fs.read(abs)
    const fresh = previewOf(path, text, st.size, st.mtimeMs)
    const isEdit = keep.mode === 'edit' && fresh.readOnly === null
    const preview: Preview = {
      ...fresh,
      mode: isEdit ? 'edit' : 'view',
      top: Math.min(keep.top ?? 0, Math.max(0, fresh.lines.length - 1)),
      row: Math.min(keep.row ?? 0, Math.max(0, fresh.lines.length - 1)),
      col: keep.col ?? 0,
      status: keep.status ?? null,
    }
    history.delete(path)
    saved.set(path, fresh.lines)
    await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), preview, error: null }))
  } catch (err) {
    await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), error: `cannot read ${path}: ${String(err)}` }))
  }
}

async function goUp($: EngineInterface) {
  const ex = await getExplorer($)
  if (ex.preview?.mode === 'edit') return leaveEdit($)
  if (ex.preview) {
    await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), preview: null }))
    return
  }
  if (ex.onlyTouched) {
    await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), onlyTouched: false }))
    return loadDir($, ex.dir)
  }
  if (!ex.dir) return
  return loadDir($, parentOf(ex.dir), ex.dir)
}

async function openEntry($: EngineInterface, entry: Entry, edit = false) {
  if (entry.kind === 'dir') return loadDir($, entry.path)
  await loadPreview($, entry.path)
  if (edit) await enterEdit($)
}

// ---------------------------------------------------------------- editing

async function enterEdit($: EngineInterface) {
  await setPreview($, p =>
    p.readOnly
      ? { ...p, status: `read-only: ${p.readOnly}` }
      : { ...p, mode: 'edit', row: Math.min(Math.max(p.row, p.top), Math.max(0, p.lines.length - 1)), status: null, confirm: null },
  )
}

/** Back to view mode; with unsaved edits the first press warns and a second discards them. */
async function leaveEdit($: EngineInterface) {
  const p = (await getExplorer($)).preview
  if (!p) return
  if (!p.dirty) return setPreview($, x => ({ ...x, mode: 'view', status: null, confirm: null }))
  if (p.confirm !== 'discard') {
    return setPreview($, x => ({ ...x, status: 'unsaved changes: ctrl+s saves, ctrl+e again discards them', confirm: 'discard' }))
  }
  // Discard: read the file again as it is on disk.
  await loadPreview($, p.path, { top: p.top, row: p.row, col: p.col, status: 'changes discarded' })
}

async function saveFile($: EngineInterface) {
  const ex = await getExplorer($)
  const p = ex.preview
  if (!p || p.mode !== 'edit') return
  if (p.readOnly) return setPreview($, x => ({ ...x, status: `read-only: ${p.readOnly}` }))
  const abs = absOf(ex.root, p.path)
  try {
    const st = await $.fs.stat(abs).catch(() => null)
    // Someone (Claude, another editor) changed the file since it was read: a second ctrl+s overwrites.
    if (st && p.mtimeMs && Math.abs(st.mtimeMs - p.mtimeMs) > 1 && p.confirm !== 'overwrite') {
      return setPreview($, x => ({ ...x, status: 'the file changed on disk: ctrl+s again overwrites it, ctrl+e twice reloads it', confirm: 'overwrite' }))
    }
    await $.fs.write(abs, textOf(p))
    const after = await $.fs.stat(abs).catch(() => null)
    saved.set(p.path, p.lines)
    await setPreview($, x => ({ ...x, dirty: false, mtimeMs: after?.mtimeMs ?? x.mtimeMs, status: 'saved ✓', confirm: null }))
    $.ui.toast(`Saved ${p.path}`)
  } catch (err) {
    await setPreview($, x => ({ ...x, status: `cannot save: ${String(err)}`, confirm: null }))
  }
}

async function undoEdit($: EngineInterface, room: number) {
  const p = (await getExplorer($)).preview
  if (!p) return
  const steps = history.get(p.path) ?? []
  const last = steps.pop()
  if (!last) return setPreview($, x => ({ ...x, status: 'nothing to undo' }))
  const base = saved.get(p.path)
  const isSaved = base !== undefined && base.length === last.lines.length && base.every((l, i) => l === last.lines[i])
  await setPreview($, x => {
    const rows = Math.max(1, hasNoteRow(x) ? room - 1 : room)
    const top = last.row < x.top || last.row >= x.top + rows ? Math.max(0, last.row - Math.floor(rows / 2)) : x.top
    return { ...x, ...last, top, dirty: !isSaved, status: null, confirm: null }
  })
}

/** One key, a click on the mode label, or a click in the text, while editing. */
async function editMessage($: EngineInterface, p: Preview, d: { k?: string; key?: string; ctrl?: boolean; meta?: boolean; row?: number; vis?: number }, room: number) {
  if (d.k === 'mode' || d.k === 'crumb') return leaveEdit($)
  if (d.k === 'place' && typeof d.row === 'number' && typeof d.vis === 'number') {
    const row = Math.min(p.top + d.row, Math.max(0, p.lines.length - 1))
    const col = colFromVisual(p.lines[row] ?? '', Math.max(0, d.vis))
    return setPreview($, x => ({ ...x, row, col, confirm: null }))
  }
  if (d.k !== 'key' || typeof d.key !== 'string') return
  const r = reduceEdit(p, { key: d.key, ...(d.ctrl ? { ctrl: true } : {}), ...(d.meta ? { meta: true } : {}) }, room)
  if (r.effect === 'save') return saveFile($)
  if (r.effect === 'exit') return leaveEdit($)
  if (r.effect === 'undo') return undoEdit($, room)
  if (r.changed) {
    const steps = history.get(p.path) ?? []
    steps.push({ lines: p.lines, row: p.row, col: p.col })
    if (steps.length > MAX_UNDO) steps.shift()
    history.set(p.path, steps)
  }
  if (r.p !== p) await setPreview($, () => r.p)
}

async function mention($: EngineInterface, path: string) {
  const filled = await $.prompt.fill({ text: `@${path} `, mode: 'insert' })
  $.ui.toast(filled.isFilled ? `@${path} added to your prompt` : 'The prompt is busy; try again when it is free')
}

async function initExplorer($: EngineInterface, showHidden: boolean) {
  const root = await $.session.cwd()
  const ex = await getExplorer($)
  // Keep where the person was across reloads; start over when the session moved to another folder.
  if (ex.root === root) {
    await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), showHidden }))
    return loadDir($, ex.dir)
  }
  await update($, explorer, () => ({ ...DEFAULT_EXPLORER, root, showHidden }))
  return loadDir($, '')
}

async function refreshUsage($: EngineInterface) {
  const u = await $.session.usage().catch(() => null)
  if (!u) return
  await update($, vitals, x => ({
    ...normalize(DEFAULT_VITALS, x),
    pct: u.context?.percent ?? null,
    tokens: u.context?.tokens ?? null,
    window: u.context?.window ?? null,
    costUsd: u.cost?.usd ?? null,
    limits: (u.rateLimits ?? []).map(r => ({ kind: r.kind, pct: r.percentUsed })),
  }))
}

/** Records a file Claude edited, and shows it in the folder on screen. */
async function noteEdit($: EngineInterface, e: unknown) {
  const input = e as unknown as { file_path?: unknown; notebook_path?: unknown }
  const abs = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null
  if (!abs) return
  const ex = await getExplorer($)
  const path = relTo(ex.root, abs)
  await update($, touched, t => ({ ...(t ?? {}), [path]: ((t ?? {})[path] ?? 0) + 1 }))
  // The file open in the preview changed under it: show the new text, unless the person has unsaved edits.
  if (ex.preview && ex.preview.path === path) {
    const p = emptyPreview(ex.preview.path, ex.preview)
    if (p.dirty) await setPreview($, x => ({ ...x, status: 'Claude changed this file on disk: saving will ask before overwriting' }))
    else await loadPreview($, p.path, { mode: p.mode, top: p.top, row: p.row, col: p.col, status: 'reloaded: Claude changed this file' })
  }
  // A new file in the folder on screen shows without a manual refresh.
  if (!ex.preview && !ex.onlyTouched && parentOf(path) === ex.dir && !ex.entries.some(x => x.path === path)) await loadDir($, ex.dir)
  if (ex.onlyTouched) await loadDir($, ex.dir)
}

async function refreshModel($: EngineInterface) {
  const model = await $.session.model().catch(() => '')
  if (model) await update($, vitals, x => ({ ...normalize(DEFAULT_VITALS, x), model }))
}

/** Adds a card for a spawned subagent. */
async function noteSpawn(
  $: EngineInterface,
  e: { name?: string; subagentType?: string; description?: string; background?: boolean },
  id: string,
  model: string | undefined,
) {
  const type = e.subagentType ?? 'agent'
  const agent: Agent = normalizeAgent({
    id,
    name: e.name ?? type.split(':').pop() ?? 'agent',
    type,
    model: model ?? '',
    task: e.description ?? '',
    startedAt: await $.clock.now(),
    isBackground: e.background === true,
  })
  await update($, agents, list => [...(list ?? []).filter(a => a.id !== agent.id), agent].slice(-24))
}

export const register: Register = (on, options) => {
  const C = options.palette === 'theme' ? THEME : ONE_DARK
  const showHiddenDefault = options.showHidden === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'strackzdevhub',
      description: 'STRACKZDEVHUB: open or close the hub, jump the explorer to a folder, or reset it',
      argumentHint: '[close|cd <path>|save|reset]',
    })
    await Promise.all([refreshUsage($), refreshModel($)]).catch(() => undefined)
    await initExplorer($, showHiddenDefault).catch(() => undefined)
    if (options.openOnStart !== false) void openPane($).catch(() => undefined)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, agents, () => [])
    return next(e)
  })

  on('command.run', { command: 'strackzdevhub' }, async ($, e) => {
    const args = e.args.trim()
    const [verb = ''] = args.split(/\s+/)
    if (verb === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'STRACKZDEVHUB closed.' }
    }
    if (verb === 'reset') {
      await update($, touched, () => ({}))
      await update($, agents, () => [])
      await update($, explorer, () => DEFAULT_EXPLORER)
      await initExplorer($, showHiddenDefault)
      return { text: 'STRACKZDEVHUB reset: explorer back at the root, touched files and agents cleared.' }
    }
    if (verb === 'save') {
      const p = (await getExplorer($)).preview
      if (!p || p.mode !== 'edit') return { text: 'Nothing to save: open a file and press e to edit it.' }
      await saveFile($)
      const after = (await getExplorer($)).preview
      return { text: `STRACKZDEVHUB: ${after?.status ?? 'saved'}` }
    }
    if (verb === 'cd') {
      const ex = await getExplorer($)
      const target = args.slice(2).trim().replace(/^\.\/?/, '').replace(/\/+$/, '')
      const root = ex.root.replace(/\/+$/, '')
      const rel = target === root ? '' : target.startsWith('/') ? relTo(root, target) : target
      if (rel.startsWith('/') || rel.split('/').includes('..')) return { text: `${target} is outside ${ex.root}.` }
      await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), onlyTouched: false, filter: '' }))
      await loadDir($, rel)
      const after = await getExplorer($)
      if (after.error) return { text: `STRACKZDEVHUB: ${after.error}` }
      await openPane($)
      return { text: `STRACKZDEVHUB explorer at ./${rel}` }
    }
    await refreshModel($)
    const opened = await openPane($)
    if (!opened.isPlaced) return { text: `STRACKZDEVHUB is not shown yet: ${opened.reason ?? 'no room'}` }
    return { text: 'STRACKZDEVHUB open. Click the file list to give it the keyboard; Esc hands it back.' }
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.permission_mode) {
      await update($, vitals, x => ({ ...normalize(DEFAULT_VITALS, x), mode: String(e.permission_mode) })).catch(() => undefined)
    }
    return next(e)
  })

  // turn.start is the main loop's alone: a subagent's turn never raises it.
  on('turn.start', async ($, e, next) => {
    const [now, u] = await Promise.all([$.clock.now(), $.session.usage().catch(() => null)])
    await update($, vitals, x => ({ ...normalize(DEFAULT_VITALS, x), turnStartedAt: now, turnCostStart: u?.cost?.usd ?? null }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await update($, vitals, x => {
        const v = normalize(DEFAULT_VITALS, x)
        return { ...v, model: e.model, effort: e.effort === undefined ? v.effort : String(e.effort) }
      })
      return yield* next(e)
    }
    const result = yield* next(e)
    const id = e.agentId
    await update($, agents, list => (list ?? []).map(a => (a.id === id ? stepAgent(a, e.model, result.usage) : a))).catch(() => undefined)
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || !started.agentId) return started
    // Bookkeeping only: a failure here must never fail the Agent call.
    await noteSpawn($, e, started.agentId, started.model).catch(() => undefined)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) {
      // A finished agent leaves the list.
      const id = e.agentId
      await update($, agents, list => (list ?? []).filter(a => a.id !== id)).catch(() => undefined)
      return done
    }
    const [now, u] = await Promise.all([$.clock.now(), $.session.usage().catch(() => null)])
    await update($, vitals, x => {
      const v = normalize(DEFAULT_VITALS, x)
      const cost = u?.cost?.usd ?? null
      return {
        ...v,
        turnStartedAt: null,
        lastTurnMs: v.turnStartedAt === null ? v.lastTurnMs : now - v.turnStartedAt,
        lastTurnCost: cost !== null && v.turnCostStart !== null ? cost - v.turnCostStart : v.lastTurnCost,
        costUsd: cost ?? v.costUsd,
      }
    })
    return done
  })

  on('session.measure', async ($, e, next) => {
    await update($, vitals, x => ({
      ...normalize(DEFAULT_VITALS, x),
      pct: e.context?.percent ?? null,
      tokens: e.context?.tokens ?? null,
      window: e.context?.window ?? null,
      costUsd: e.cost?.usd ?? null,
      limits: (e.rateLimits ?? []).map(r => ({ kind: r.kind, pct: r.percentUsed })),
    }))
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') {
      await update($, vitals, x => {
        const v = normalize(DEFAULT_VITALS, x)
        return { ...v, compactions: v.compactions + 1 }
      }).catch(() => undefined)
    }
    return done
  })

  on('tool.call', async ($, e, next) => {
    // An agent's current activity shows as the call starts, not once it ends.
    if (e.agentId) {
      const id = e.agentId
      const what = describeTool(e.tool, e as unknown as Record<string, unknown>)
      await update($, agents, list => (list ?? []).map(a => (a.id === id ? { ...a, tools: a.tools + 1, lastTool: what } : a))).catch(
        () => undefined,
      )
    }
    const ran = await next(e)
    if (!EDIT_TOOLS.has(e.tool) || ran.deny !== undefined || ran.isError === true) return ran
    // Bookkeeping only: a failure here must never change the call's result.
    await noteEdit($, e).catch(() => undefined)
    return ran
  })

  on('ui.message', async ($, e) => {
    const d = e.data as { k?: string; key?: string; ctrl?: boolean; meta?: boolean; index?: number; room?: number; row?: number; vis?: number }
    const room = Math.max(3, Number(d.room) || 10)
    const ex = await getExplorer($)
    if (ex.preview?.mode === 'edit') {
      await editMessage($, ex.preview, d, room)
      return {}
    }
    if (d.k === 'mode') {
      if (ex.preview) await enterEdit($)
      return {}
    }
    if (d.k === 'click' && typeof d.index === 'number') {
      const entry = visibleEntries(ex)[d.index]
      if (entry) {
        await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), cursor: d.index ?? 0 }))
        await openEntry($, entry)
      }
      return {}
    }
    if (d.k === 'crumb') {
      if (ex.isFiltering || ex.filter) await update($, explorer, x => ({ ...normalize(DEFAULT_EXPLORER, x), isFiltering: false, filter: '', cursor: 0 }))
      await goUp($)
      return {}
    }
    if (d.k !== 'key' || typeof d.key !== 'string') return {}
    const { ex: nextEx, effect } = reduceKey(ex, { key: d.key, ...(d.ctrl ? { ctrl: true } : {}), ...(d.meta ? { meta: true } : {}) }, room)
    if (nextEx !== ex) await update($, explorer, () => nextEx)
    if (effect?.kind === 'open') await openEntry($, effect.entry, effect.edit === true)
    else if (effect?.kind === 'edit') await enterEdit($)
    else if (effect?.kind === 'up') await goUp($)
    else if (effect?.kind === 'mention') await mention($, effect.path)
    else if (effect?.kind === 'reload') await loadDir($, nextEx.dir)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const hasClient = 'Client' in els
    const [v, ex, t, list, now] = await Promise.all([getVitals($), getExplorer($), getTouched($), getAgents($), $.clock.now()])
    const W = Math.max(40, e.props.bodyColumns)
    const inner = W - 4 // a section's round border and its one-cell padding each side
    const bodyRows = Math.max(8, e.props.scroll.bodyRows)

    const clock = (key: string, since: number, color: string) =>
      hasClient ? (
        <els.Client key={key} module="./elapsed.tsx" props={{ since, now, color }} />
      ) : (
        <Text color={color}>{fmtDuration(now - since)}</Text>
      )

    const section = (title: string, right: unknown, body: unknown, color = C.frame) => (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} width={W}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={C.dim} bold>
            {title}
          </Text>
          {right as never}
        </Box>
        {body as never}
      </Box>
    )

    // ---- vitals
    const effortN = EFFORT_LEVEL[v.effort] ?? 0
    const pct = v.pct ?? 0
    const ctxColor = pct >= 85 ? C.bad : pct >= 70 ? C.warn : C.ok
    const gaugeW = Math.max(6, Math.min(24, inner - 36))
    const modeColor = C[modeColorKey(v.mode)]
    const isRunning = v.turnStartedAt !== null
    const turn = isRunning ? (
      <Text>
        <Text color={C.ok}>● </Text>
        {clock('turn-timer', v.turnStartedAt ?? now, C.ok)}
      </Text>
    ) : (
      <Text color={C.dim}>{v.lastTurnMs === null ? '○ idle' : `○ idle · last ${fmtDuration(v.lastTurnMs)}`}</Text>
    )

    const vitalsBox = section(
      'SESSION',
      turn,
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text backgroundColor={C.accent} color={C.pillFg} bold>
              {` ${prettyModel(v.model)} `}
            </Text>
            {hasLongContext(v.model) ? <Text color={C.accent}> 1M</Text> : null}
            <Text color={C.dim}>{'  effort '}</Text>
            <Text color={C.purple}>{'●'.repeat(effortN) + '○'.repeat(Math.max(0, 5 - effortN))}</Text>
            <Text color={C.text}>{` ${v.effort || '—'}`}</Text>
          </Text>
          <Text color={modeColor} bold>
            {v.mode}
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color={C.dim}>{'ctx  '}</Text>
            <Text color={ctxColor}>{gauge(pct, gaugeW)}</Text>
            <Text color={C.text} bold>
              {v.pct === null ? ' —' : ` ${Math.round(pct)}%`}
            </Text>
            {v.tokens !== null && v.window ? <Text color={C.dim}>{`  ${fmtTokens(v.tokens)} / ${fmtTokens(v.window)}`}</Text> : null}
            {v.compactions > 0 ? <Text color={C.dim}>{`  ⟲${v.compactions}`}</Text> : null}
          </Text>
          <Text>
            <Text color={C.ok} bold>
              {v.costUsd === null ? '$—' : fmtUsd(v.costUsd)}
            </Text>
            {v.lastTurnCost !== null && v.lastTurnCost > 0.005 ? <Text color={C.dim}>{` +${fmtUsd(v.lastTurnCost)}`}</Text> : null}
          </Text>
        </Box>
        {v.limits.length > 0 ? (
          <Text wrap="truncate-end">
            <Text color={C.dim}>{'lim  '}</Text>
            {v.limits.slice(0, 3).map(l => (
              <Text>
                <Text color={C.dim}>{`${limitLabel(l.kind)} `}</Text>
                <Text color={l.pct >= 85 ? C.bad : l.pct >= 60 ? C.warn : C.ok}>{gauge(l.pct, 6)}</Text>
                <Text color={C.text}>{` ${Math.round(l.pct)}%    `}</Text>
              </Text>
            ))}
          </Text>
        ) : null}
      </Box>,
    )
    const vitalsRows = 2 + 1 + 2 + (v.limits.length > 0 ? 1 : 0)

    // ---- agents: only while some run; each leaves when it finishes
    // Agents give way before the file list drops under 3 rows.
    const spare = bodyRows - vitalsRows - 5 - 3 - 3
    const fit = Math.max(1, Math.min(MAX_AGENTS, Math.floor((spare - 1) / 2)))
    const shown = list.slice(-fit)
    const more = list.length - shown.length
    const agentsBox =
      list.length === 0
        ? null
        : section(
            `AGENTS · ${list.length} running`,
            <Text color={C.dim}>{list.some(a => a.isBackground) ? 'background' : ''}</Text>,
            <Box flexDirection="column">
              {shown.map(a => (
                <Box flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text wrap="truncate-end">
                      <Text color={C.info}>◆ </Text>
                      <Text color={C.text} bold>
                        {a.name}
                      </Text>
                      {a.type !== a.name ? <Text color={C.dim}>{` ${a.type}`}</Text> : null}
                      {a.model ? <Text color={C.purple}>{`  ${prettyModel(a.model)}`}</Text> : null}
                      <Text color={C.dim}>{`  ${a.steps} steps · ${a.tools} tools${a.ctx ? ` · ${fmtTokens(a.ctx)} ctx` : ''}`}</Text>
                    </Text>
                    {clock(`agent-${a.id}`, a.startedAt, C.info)}
                  </Box>
                  <Text wrap="truncate-end">
                    <Text color={C.dim}>{'  ↳ '}</Text>
                    <Text color={C.text}>{clipEnd(a.task ?? '', Math.max(10, inner - 30))}</Text>
                    {a.lastTool ? <Text color={C.dim}>{`  ⟶ ${a.lastTool}`}</Text> : null}
                  </Text>
                </Box>
              ))}
              {more > 0 ? <Text color={C.dim}>{`+${more} more`}</Text> : null}
            </Box>,
            C.info,
          )
    const agentsRows = list.length === 0 ? 0 : 2 + 1 + shown.length * 2 + (more > 0 ? 1 : 0)

    // ---- explorer: breadcrumb and rule, the rows, the hint line
    const room = Math.max(3, bodyRows - vitalsRows - agentsRows - 2 - 3)
    const rows = visibleEntries(ex)
    const rootName = baseName(ex.root) || '/'
    const crumbs = ex.onlyTouched ? [rootName, '✎ touched'] : [rootName, ...(ex.dir ? ex.dir.split('/') : [])]
    const touchedN = Object.keys(t).length
    let props: ExplorerProps

    if (ex.preview) {
      const p = ex.preview
      const isEdit = p.mode === 'edit'
      const codeRoom = hasNoteRow(p) || ex.error ? room - 1 : room
      const end = Math.min(p.lines.length, p.top + codeRoom)
      const hints: Hint[] = isEdit
        ? [
            { key: 'ctrl+s', label: 'save' },
            { key: 'ctrl+e', label: 'view' },
            { key: 'ctrl+z', label: 'undo' },
            { key: 'click', label: 'place cursor' },
          ]
        : [
            ...(p.readOnly ? [] : [{ key: 'e', label: 'edit' }]),
            { key: '↑↓', label: 'scroll' },
            { key: 'PgUp/Dn', label: 'page' },
            { key: 'g/G', label: 'top/end' },
            { key: '@', label: 'mention' },
            { key: '⌫', label: 'back' },
          ]
      let edit: ExplorerProps['edit'] = null
      if (isEdit) {
        const gutterW = Math.max(3, String(end).length)
        const textW = Math.max(4, inner - gutterW - 3)
        const line = p.lines[p.row] ?? ''
        const cursorVis = visualCol(line, p.col)
        const hoff = cursorVis >= textW - 1 ? cursorVis - textW + 2 : 0
        edit = {
          lines: p.lines.slice(p.top, end).map(displayOf),
          startLine: p.top + 1,
          cursorRow: p.row - p.top,
          cursorVis,
          hoff,
          gutterW,
          textW,
        }
      }
      props = {
        mode: 'preview',
        crumbs: [rootName, ...p.path.split('/')],
        counter: isEdit ? `Ln ${p.row + 1}, Col ${p.col + 1}` : p.lines.length > codeRoom ? `${p.top + 1}–${end} / ${p.lines.length}` : `${p.lines.length} lines`,
        filter: null,
        hints,
        rows: [],
        top: 0,
        room,
        width: inner,
        code: !isEdit && end > p.top ? { source: p.lines.slice(p.top, end).map(l => clipEnd(l, MAX_DRAWN)).join('\n'), path: p.path, startLine: p.top + 1 } : null,
        note: ex.error ?? p.status ?? p.note,
        empty: null,
        colors: C,
        fileMode: isEdit ? 'edit' : p.readOnly ? 'readonly' : 'view',
        readOnly: p.readOnly,
        isDirty: p.dirty,
        edit,
      }
    } else {
      const cursor = Math.min(ex.cursor, Math.max(0, rows.length - 1))
      const top = windowTop(cursor, rows.length, room)
      const hints: Hint[] = ex.isFiltering
        ? [
            { key: 'type', label: 'to filter' },
            { key: '⏎', label: 'done' },
            { key: '⌫', label: 'erase' },
          ]
        : [
            { key: '⏎', label: 'open' },
            { key: 'e', label: 'edit' },
            { key: '⌫', label: 'back' },
            { key: '/', label: 'filter' },
            { key: '.', label: ex.showHidden ? 'hide dotfiles' : 'dotfiles' },
            { key: 't', label: touchedN ? `touched (${touchedN})` : 'touched' },
            { key: '@', label: 'mention' },
          ]
      props = {
        mode: 'list',
        crumbs,
        counter: ex.error && rows.length ? `⚠ ${clipEnd(ex.error, 30)}` : rows.length ? `${cursor + 1}/${rows.length}` : '',
        filter: ex.isFiltering || ex.filter ? `${ex.filter}${ex.isFiltering ? '▏' : ''}` : null,
        hints,
        rows: rows.slice(top, top + room).map((r, i) => ({
          icon: r.kind === 'dir' ? '▸' : '·',
          label: r.kind === 'dir' ? `${r.name}/` : r.name,
          meta: ex.onlyTouched ? `${t[r.path] ?? 0} edits` : r.kind === 'dir' ? '' : `${fmtSize(r.size)} · ${fmtAge(now - r.mtimeMs)}`,
          isDir: r.kind === 'dir',
          isTouched: (t[r.path] ?? 0) > 0,
          isSelected: top + i === cursor,
        })),
        top,
        room,
        width: inner,
        code: null,
        note: null,
        fileMode: null,
        readOnly: null,
        isDirty: false,
        edit: null,
        empty: rows.length > 0 ? null : ex.error ?? (rows.length === 0 ? (ex.onlyTouched ? 'No files touched yet this session.' : ex.filter ? 'Nothing matches the filter.' : 'Empty folder.') : null),
        colors: C,
      }
    }

    const filesBox = (
      <Box flexDirection="column" borderStyle="round" borderColor={ex.preview?.mode === 'edit' ? C.warn : ex.preview ? C.accent : C.frame} paddingX={1} width={W}>
        {hasClient ? (
          <els.Client key="explorer" module="./explorer.tsx" props={props} width={inner} height={room + 3} />
        ) : (
          <Text color={C.dim}>The file explorer needs a surface that runs client modules (the terminal does).</Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" width={W}>
        {vitalsBox}
        {agentsBox}
        {filesBox}
      </Box>
    )
  })
}
