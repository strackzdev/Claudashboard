// The hub's stored state and the small helpers every module reads and writes it through.
import type { EngineInterface } from 'claude-code'
import { atom, read, update } from 'claude-code'
import type { Agent, Explorer, Preview, Vitals } from '../types'
import { normalizeAgent } from './agents'
import { DEFAULT_EXPLORER, DEFAULT_VITALS, emptyPreview, normalize } from './explorer-state'
import type { Key } from './explorer-state'
import { isAbsolute, joinPath } from './paths'

export const PANE = 'strackzdevhub'
export const TITLE = 'STRACKZDEVHUB'

const vitals = atom({ plugin: 'strackzdevhub', key: 'vitals' } as const, DEFAULT_VITALS)
const explorer = atom({ plugin: 'strackzdevhub', key: 'explorer' } as const, DEFAULT_EXPLORER)
const touched = atom({ plugin: 'strackzdevhub', key: 'touched' } as const, {})
const agents = atom({ plugin: 'strackzdevhub', key: 'agents' } as const, [] as Agent[])
const gitTick = atom({ plugin: 'strackzdevhub', key: 'gitTick' } as const, 0)

export async function getVitals($: EngineInterface): Promise<Vitals> {
  return normalize(DEFAULT_VITALS, await read($, vitals))
}
export async function getExplorer($: EngineInterface): Promise<Explorer> {
  const ex = normalize(DEFAULT_EXPLORER, await read($, explorer))
  // A preview stored by an older version lacks the editor's fields.
  return ex.preview ? { ...ex, preview: emptyPreview(ex.preview.path, ex.preview) } : ex
}
export function updateExplorer($: EngineInterface, fn: (ex: Explorer) => Explorer) {
  return update($, explorer, x => fn(normalize(DEFAULT_EXPLORER, x)))
}
export function updateVitals($: EngineInterface, fn: (v: Vitals) => Vitals) {
  return update($, vitals, x => fn(normalize(DEFAULT_VITALS, x)))
}

type Usage = {
  context?: { percent?: number | null; tokens?: number | null; window?: number | null } | null
  cost?: { usd?: number | null } | null
  rateLimits?: Array<{ kind: string; percentUsed: number }> | null
}
/** The vitals a usage report (from `session.usage()` or `session.measure`) sets. */
export const usageToVitals = (u: Usage): Partial<Vitals> => ({
  pct: u.context?.percent ?? null,
  tokens: u.context?.tokens ?? null,
  window: u.context?.window ?? null,
  costUsd: u.cost?.usd ?? null,
  limits: (u.rateLimits ?? []).map(r => ({ kind: r.kind, pct: r.percentUsed })),
})

export const sameLines = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((l, i) => l === b[i])
/** Whether the file on disk is newer than the copy the preview read. */
export const changedOnDisk = (st: { mtimeMs: number } | null, p: Preview) => Boolean(st && p.mtimeMs && Math.abs(st.mtimeMs - p.mtimeMs) > 1)
export const toKey = (d: { key: string; ctrl?: boolean; meta?: boolean }): Key => ({
  key: d.key,
  ...(d.ctrl ? { ctrl: true } : {}),
  ...(d.meta ? { meta: true } : {}),
})

/** Undo steps per file, newest last, and the text as last read or saved; the module's own, so a reload drops them. */
export const history = new Map<string, Array<Pick<Preview, 'lines' | 'row' | 'col'>>>()
export const saved = new Map<string, string[]>()
export const MAX_UNDO = 100

export function setPreview($: EngineInterface, fn: (p: Preview) => Preview) {
  return updateExplorer($, ex => (ex.preview ? { ...ex, preview: fn(emptyPreview(ex.preview.path, ex.preview)) } : ex))
}
export async function getTouched($: EngineInterface): Promise<Record<string, number>> {
  return (await read($, touched)) ?? {}
}
export async function getAgents($: EngineInterface): Promise<Agent[]> {
  const list = await read($, agents)
  return Array.isArray(list) ? list.map(a => normalizeAgent(a)) : []
}

// The engine lists what a module stores by reading these calls, so every read and update of an atom stays in this file.
export function setExplorer($: EngineInterface, ex: Explorer) {
  return update($, explorer, () => ex)
}
export function updateAgents($: EngineInterface, fn: (list: Agent[]) => Agent[]) {
  return update($, agents, list => fn(list ?? []))
}
export function updateTouched($: EngineInterface, fn: (t: Record<string, number>) => Record<string, number>) {
  return update($, touched, t => fn(t ?? {}))
}
/** The gutter's base changed: redraw the pane, which reads the tick. */
export function bumpGitTick($: EngineInterface) {
  return update($, gitTick, n => (n ?? 0) + 1)
}
export function readGitTick($: EngineInterface) {
  return read($, gitTick)
}

/** Whether the pane is on screen: the live refresh runs only while it is. */
export const paneState = { isOpen: false }

export async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: TITLE, columns: 76, rows: 30 })
  paneState.isOpen = true
  return opened
}

export const absOf = (root: string, path: string) => (isAbsolute(path) ? path : joinPath(root, path))

/** The `.catch` for bookkeeping that must never fail the event it rides on: the error goes to the debug log (`claude --debug`). */
export function logged($: EngineInterface, where: string) {
  return (err: unknown) => {
    $.ui.log(`${where}: ${String(err)}`, { to: 'debug' })
  }
}
