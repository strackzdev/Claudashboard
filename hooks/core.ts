// Pure logic for STRACKZDEVHUB: formatting, paths, and the explorer's key reducer. No `$` here, so it is testable.
import type { Entry, Explorer, Preview, Vitals } from '../types'

export const DEFAULT_VITALS: Vitals = {
  model: '',
  effort: '',
  mode: 'default',
  pct: null,
  tokens: null,
  window: null,
  costUsd: null,
  limits: [],
  compactions: 0,
  turnStartedAt: null,
  turnCostStart: null,
  lastTurnMs: null,
  lastTurnCost: null,
}

export const DEFAULT_EXPLORER: Explorer = {
  root: '',
  dir: '',
  entries: [],
  cursor: 0,
  top: 0,
  filter: '',
  isFiltering: false,
  showHidden: false,
  onlyTouched: false,
  preview: null,
  error: null,
}

/** The largest file the preview reads, and the most lines it keeps. */
export const MAX_PREVIEW_BYTES = 1024 * 1024
export const MAX_PREVIEW_LINES = 5000
const MAX_LINE = 400

// ---------------------------------------------------------------- formatting

export const fmtUsd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`)

export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** `claude-opus-5-5[1m]` → `opus 5.5`. */
export function prettyModel(id: string): string {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(id)
  if (!m) return id || '—'
  return `${(m[1] ?? '').toLowerCase()} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}`
}

export function gauge(pct: number, width: number): string {
  const n = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '▰'.repeat(n) + '▱'.repeat(width - n)
}

export const EFFORT_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return '7d'
  return kind.replace(/_/g, ' ')
}

/** Shortens text to `n` cells, keeping the end (a path's useful part). */
export function clipStart(text: string, n: number): string {
  return text.length <= n ? text : `…${text.slice(text.length - n + 1)}`
}

export function clipEnd(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, Math.max(0, n - 1))}…`
}

// ---------------------------------------------------------------- paths

export const joinPath = (root: string, rel: string) => (rel ? `${root.replace(/\/+$/, '')}/${rel}` : root)

export const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

export const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)

/** A path relative to `root` when inside it, else the absolute path as given. */
export function relTo(root: string, abs: string): string {
  const r = root.replace(/\/+$/, '')
  return abs.startsWith(`${r}/`) ? abs.slice(r.length + 1) : abs
}

// ---------------------------------------------------------------- explorer

export function sortEntries(list: Entry[]): Entry[] {
  return [...list].sort((a, b) => {
    const da = a.kind === 'dir' ? 0 : 1
    const db = b.kind === 'dir' ? 0 : 1
    return da - db || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

/** The rows the list shows: hidden files and the filter applied. */
export function visibleEntries(ex: Explorer): Entry[] {
  const f = ex.filter.toLowerCase()
  return ex.entries.filter(e => (ex.showHidden || ex.onlyTouched || !e.name.startsWith('.')) && (!f || e.name.toLowerCase().includes(f)))
}

/** The first visible row so the cursor stays in a window of `room` rows. */
export function windowTop(cursor: number, count: number, room: number): number {
  if (count <= room) return 0
  return Math.max(0, Math.min(cursor - Math.floor(room / 3), count - room))
}

/** Text the preview can draw: tab and newline the only control characters, long lines cut. */
export function previewOf(path: string, text: string, size: number): Preview {
  if (size > MAX_PREVIEW_BYTES) return { path, lines: [], top: 0, note: `${fmtSize(size)}: too large to preview` }
  if (text.slice(0, 8000).includes('\u0000')) return { path, lines: [], top: 0, note: `binary file, ${fmtSize(size)}` }
  const all = text.replace(/\r\n?/g, '\n').split('\n')
  if (all.length > 1 && all[all.length - 1] === '') all.pop()
  const lines = all.slice(0, MAX_PREVIEW_LINES).map(l =>
    // eslint-disable-next-line no-control-regex
    clipEnd(l.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ''), MAX_LINE),
  )
  const note = all.length > MAX_PREVIEW_LINES ? `showing the first ${MAX_PREVIEW_LINES} of ${all.length} lines` : null
  return { path, lines, top: 0, note }
}

export type Effect =
  | { kind: 'open'; entry: Entry }
  | { kind: 'up' }
  | { kind: 'mention'; path: string }
  | { kind: 'reload' }
  | null

export type Key = { key: string; ctrl?: true; meta?: true; shift?: true }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * One key against the explorer: the next state, and the I/O the hooks module owes for it.
 * `room` is how many rows the list or preview shows, for paging.
 */
export function reduceKey(ex: Explorer, k: Key, room: number): { ex: Explorer; effect: Effect } {
  const page = Math.max(1, room - 1)
  const key = k.key

  if (ex.preview) {
    const p = ex.preview
    const last = Math.max(0, p.lines.length - room)
    const scroll = (top: number) => ({ ex: { ...ex, preview: { ...p, top: clamp(top, 0, last) } }, effect: null })
    if (key === 'backspace' || key === 'left' || key === 'q') return { ex, effect: { kind: 'up' } }
    if (key === 'down' || key === 'j') return scroll(p.top + 1)
    if (key === 'up' || key === 'k') return scroll(p.top - 1)
    if (key === 'pagedown' || key === 'space' || key === ' ') return scroll(p.top + page)
    if (key === 'pageup') return scroll(p.top - page)
    if (key === 'home' || key === 'g') return scroll(0)
    if (key === 'end' || key === 'G') return scroll(last)
    if (key === '@') return { ex, effect: { kind: 'mention', path: p.path } }
    return { ex, effect: null }
  }

  if (ex.isFiltering) {
    if (key === 'return' || key === 'tab') return { ex: { ...ex, isFiltering: false }, effect: null }
    if (key === 'backspace') {
      if (!ex.filter) return { ex: { ...ex, isFiltering: false }, effect: null }
      return { ex: { ...ex, filter: ex.filter.slice(0, -1), cursor: 0 }, effect: null }
    }
    if (key.length === 1 && !k.ctrl && !k.meta) return { ex: { ...ex, filter: ex.filter + key, cursor: 0 }, effect: null }
    // Arrows still move while typing a filter.
  }

  const rows = visibleEntries(ex)
  const n = rows.length
  const move = (c: number) => ({ ex: { ...ex, cursor: clamp(c, 0, Math.max(0, n - 1)) }, effect: null })
  const current = rows[clamp(ex.cursor, 0, Math.max(0, n - 1))]

  if (key === 'down' || (!ex.isFiltering && key === 'j')) return move(ex.cursor + 1)
  if (key === 'up' || (!ex.isFiltering && key === 'k')) return move(ex.cursor - 1)
  if (key === 'pagedown') return move(ex.cursor + page)
  if (key === 'pageup') return move(ex.cursor - page)
  if (key === 'home') return move(0)
  if (key === 'end') return move(n - 1)
  if (key === 'return' || key === 'right' || (!ex.isFiltering && key === 'l')) {
    return current ? { ex, effect: { kind: 'open', entry: current } } : { ex, effect: null }
  }
  if (ex.isFiltering) return { ex, effect: null }
  if (key === 'backspace' || key === 'left' || key === 'h') {
    if (ex.filter) return { ex: { ...ex, filter: '', cursor: 0 }, effect: null }
    return { ex, effect: { kind: 'up' } }
  }
  if (key === '/') return { ex: { ...ex, isFiltering: true }, effect: null }
  if (key === '.') return { ex: { ...ex, showHidden: !ex.showHidden, cursor: 0 }, effect: null }
  if (key === 't') return { ex: { ...ex, onlyTouched: !ex.onlyTouched, filter: '', cursor: 0 }, effect: { kind: 'reload' } }
  if (key === 'r') return { ex, effect: { kind: 'reload' } }
  if (key === '@' && current) return { ex, effect: { kind: 'mention', path: current.path } }
  return { ex, effect: null }
}

/** The touched-files view: every file Claude edited, most edits first. */
export function touchedEntries(touched: Record<string, number>): Entry[] {
  return Object.entries(touched)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([path]) => ({ name: path, path, kind: 'file' as const, size: 0, mtimeMs: 0 }))
}

/** Fills in what a stored value may lack after an upgrade. */
export function normalize<T extends object>(base: T, value: unknown): T {
  return value && typeof value === 'object' ? { ...base, ...(value as Partial<T>) } : base
}

// ---------------------------------------------------------------- agents

/** One line on what a tool call does: `Read middleware.ts`, `Bash npm test`. */
export function describeTool(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const file = str('file_path') || str('notebook_path') || str('path')
  if (file && /^(Read|Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return `${tool} ${baseName(file)}`
  if (tool === 'Bash') return `$ ${str('command').split('\n')[0]}`
  if (tool === 'Grep' || tool === 'Glob') return `${tool} ${str('pattern')}`
  if (tool === 'WebFetch') return `fetch ${str('url').replace(/^https?:\/\//, '')}`
  if (tool === 'WebSearch') return `search ${str('query')}`
  return tool
}

/** The model a step reports, applied to its agent: context is the step's whole input; output adds up. */
export function stepAgent<A extends { steps: number; ctx: number; out: number; model: string }>(
  a: A,
  model: string,
  usage: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | null | undefined,
): A {
  const u = usage ?? {}
  const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return { ...a, model: a.model || model, steps: a.steps + 1, ctx: ctx > 0 ? ctx : a.ctx, out: a.out + (u.output_tokens ?? 0) }
}

/** `[1m]` on a model id is the 1M-token context variant. */
export const hasLongContext = (id: string) => /\[1m\]/i.test(id)

export function modeColorKey(mode: string): 'ok' | 'info' | 'purple' | 'bad' | 'dim' {
  if (mode === 'auto') return 'ok'
  if (mode === 'plan') return 'info'
  if (mode === 'acceptEdits') return 'purple'
  if (mode === 'bypassPermissions') return 'bad'
  return 'dim'
}
