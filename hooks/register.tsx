// STRACKZDEVHUB: session vitals, running subagents, and a file explorer with an in-pane preview.
// This module wires the engine's events to the modules that do the work.
import type { EngineInterface, Register } from 'claude-code'
import type { Agent, Entry } from '../types'
import { describeTool, normalizeAgent, stepAgent } from './agents'
import { editMessage, enterEdit, leaveEdit, saveFile } from './editing'
import type { UiMessage } from './explorer'
import { DEFAULT_EXPLORER, reduceKey, visibleEntries } from './explorer-state'
import { loadDir, loadPreview, noteEdit, poll } from './files'
import { refreshGit } from './git'
import { ONE_DARK, THEME, registerPane } from './pane'
import { isAbsolute, parentOf, relTo, toSlash } from './paths'
import { PANE, getExplorer, openPane, paneState, setExplorer, toKey, updateAgents, updateExplorer, updateTouched, updateVitals, usageToVitals } from './state'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

async function goUp($: EngineInterface) {
  const ex = await getExplorer($)
  if (ex.preview?.mode === 'edit') return leaveEdit($)
  if (ex.preview) {
    await updateExplorer($, x => ({ ...x, preview: null }))
    void refreshGit($).catch(() => undefined)
    return
  }
  if (ex.onlyTouched) {
    await updateExplorer($, x => ({ ...x, onlyTouched: false }))
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

async function mention($: EngineInterface, path: string) {
  const filled = await $.prompt.fill({ text: `@${path} `, mode: 'insert' })
  $.ui.toast(filled.isFilled ? `@${path} added to your prompt` : 'The prompt is busy; try again when it is free')
}

async function initExplorer($: EngineInterface, showHidden: boolean) {
  const root = toSlash(await $.session.cwd())
  const ex = await getExplorer($)
  // Keep where the person was across reloads; start over when the session moved to another folder.
  if (ex.root === root) {
    await updateExplorer($, x => ({ ...x, showHidden }))
    return loadDir($, ex.dir)
  }
  await setExplorer($, { ...DEFAULT_EXPLORER, root, showHidden })
  return loadDir($, '')
}

async function refreshUsage($: EngineInterface) {
  const u = await $.session.usage().catch(() => null)
  if (!u) return
  await updateVitals($, x => ({ ...x, ...usageToVitals(u) }))
}

async function refreshModel($: EngineInterface) {
  const model = await $.session.model().catch(() => '')
  if (model) await updateVitals($, x => ({ ...x, model }))
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
  await updateAgents($, list => [...list.filter(a => a.id !== agent.id), agent].slice(-24))
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
    // Live refresh: edits made in another editor, git add/commit run elsewhere.
    $.clock.every(3000, () => poll($).catch(() => undefined))
    return next(e)
  })

  // The person closed the pane (its ✕) or the module unloads: stop asking git and the disk.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    paneState.isOpen = false
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await updateAgents($, () => [])
    return next(e)
  })

  on('command.run', { command: 'strackzdevhub' }, async ($, e) => {
    const args = e.args.trim()
    const [verb = ''] = args.split(/\s+/)
    if (verb === 'close') {
      await $.ui.close({ id: PANE })
      paneState.isOpen = false
      return { text: 'STRACKZDEVHUB closed.' }
    }
    if (verb === 'reset') {
      await updateTouched($, () => ({}))
      await updateAgents($, () => [])
      await setExplorer($, DEFAULT_EXPLORER)
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
      const target = toSlash(args.slice(2).trim()).replace(/^\.\/?/, '').replace(/\/+$/, '')
      const root = ex.root.replace(/\/+$/, '')
      const rel = target === root ? '' : isAbsolute(target) ? relTo(root, target) : target
      if (isAbsolute(rel) || rel.split('/').includes('..')) return { text: `${target} is outside ${ex.root}.` }
      await updateExplorer($, x => ({ ...x, onlyTouched: false, filter: '' }))
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
      await updateVitals($, x => ({ ...x, mode: String(e.permission_mode) })).catch(() => undefined)
    }
    return next(e)
  })

  // turn.start is the main loop's alone: a subagent's turn never raises it.
  on('turn.start', async ($, e, next) => {
    const [now, u] = await Promise.all([$.clock.now(), $.session.usage().catch(() => null)])
    await updateVitals($, x => ({ ...x, turnStartedAt: now, turnCostStart: u?.cost?.usd ?? null }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await updateVitals($, v => ({ ...v, model: e.model, effort: e.effort === undefined ? v.effort : String(e.effort) }))
      return yield* next(e)
    }
    const result = yield* next(e)
    const id = e.agentId
    await updateAgents($, list => list.map(a => (a.id === id ? stepAgent(a, e.model, result.usage) : a))).catch(() => undefined)
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
      await updateAgents($, list => list.filter(a => a.id !== id)).catch(() => undefined)
      return done
    }
    void refreshGit($).catch(() => undefined)
    const [now, u] = await Promise.all([$.clock.now(), $.session.usage().catch(() => null)])
    await updateVitals($, v => {
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
    await updateVitals($, x => ({ ...x, ...usageToVitals(e) }))
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') {
      await updateVitals($, v => ({ ...v, compactions: v.compactions + 1 })).catch(() => undefined)
    }
    return done
  })

  on('tool.call', async ($, e, next) => {
    // An agent's current activity shows as the call starts, not once it ends.
    if (e.agentId) {
      const id = e.agentId
      const what = describeTool(e.tool, e as unknown as Record<string, unknown>)
      await updateAgents($, list => list.map(a => (a.id === id ? { ...a, tools: a.tools + 1, lastTool: what } : a))).catch(
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
    // The explorer client sends these; the checks below still guard each field.
    const d = e.data as UiMessage
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
        await updateExplorer($, x => ({ ...x, cursor: d.index }))
        await openEntry($, entry)
      }
      return {}
    }
    if (d.k === 'crumb') {
      if (ex.isFiltering || ex.filter) await updateExplorer($, x => ({ ...x, isFiltering: false, filter: '', cursor: 0 }))
      await goUp($)
      return {}
    }
    if (d.k !== 'key' || typeof d.key !== 'string') return {}
    const { ex: nextEx, effect } = reduceKey(ex, toKey(d), room)
    if (nextEx !== ex) await setExplorer($, nextEx)
    if (effect?.kind === 'open') await openEntry($, effect.entry, effect.edit === true)
    else if (effect?.kind === 'edit') await enterEdit($)
    else if (effect?.kind === 'up') await goUp($)
    else if (effect?.kind === 'mention') await mention($, effect.path)
    else if (effect?.kind === 'reload') await (nextEx.preview ? refreshGit($) : loadDir($, nextEx.dir))
    return {}
  })

  registerPane(on, C)
}
