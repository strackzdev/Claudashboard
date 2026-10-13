// Pure logic for STRACKZDEVHUB: formatting, paths, and the explorer's key reducer. No `$` here, so it is testable.
import type { Agent, Entry, Explorer, Preview, Vitals } from '../types'

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
/** Lines longer than this (minified code) are cut and make the file read-only. */
const MAX_LINE = 10_000
/** The most of one line the view mode draws: the rest of a long line is off screen anyway. */
export const MAX_DRAWN = 1000

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

/** A preview with every field present: new, or stored by an older version. */
export function emptyPreview(path: string, over: Partial<Preview> = {}): Preview {
  return {
    path,
    lines: [],
    top: 0,
    note: null,
    mode: 'view',
    row: 0,
    col: 0,
    dirty: false,
    mtimeMs: 0,
    eol: true,
    crlf: false,
    readOnly: null,
    status: null,
    confirm: null,
    ...over,
  }
}

/** Whether a note or status line sits above the code, taking one of its rows. */
export const hasNoteRow = (p: Preview) => Boolean(p.note || p.status)

/**
 * Text the preview can draw: tab and newline the only control characters, long lines cut.
 * Whatever had to be altered to draw it makes the file read-only, so a save never writes the altered text.
 */
export function previewOf(path: string, text: string, size: number, mtimeMs = 0): Preview {
  if (size > MAX_PREVIEW_BYTES) return emptyPreview(path, { note: `${fmtSize(size)}: too large to preview`, readOnly: 'too large', mtimeMs })
  if (text.slice(0, 8000).includes('\u0000')) return emptyPreview(path, { note: `binary file, ${fmtSize(size)}`, readOnly: 'binary file', mtimeMs })
  const crlf = text.includes('\r\n')
  const all = text.replace(/\r\n?/g, '\n').split('\n')
  const eol = all.length > 1 && all[all.length - 1] === ''
  if (eol) all.pop()
  // eslint-disable-next-line no-control-regex
  const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g
  let readOnly: string | null = null
  if (/\r(?!\n)/.test(text) || (crlf && /(?<!\r)\n/.test(text))) readOnly = 'mixed line endings'
  else if (all.some(l => /[\u0000-\u0008\u000b-\u001f\u007f]/.test(l))) readOnly = 'control characters in the file'
  else if (all.some(l => l.length > MAX_LINE)) {
    readOnly = `line ${all.findIndex(l => l.length > MAX_LINE) + 1} is longer than ${MAX_LINE} characters`
  }
  else if (all.length > MAX_PREVIEW_LINES) readOnly = `longer than ${MAX_PREVIEW_LINES} lines`
  const lines = all.slice(0, MAX_PREVIEW_LINES).map(l => clipEnd(l.replace(CONTROL, ''), MAX_LINE))
  const note = all.length > MAX_PREVIEW_LINES ? `showing the first ${MAX_PREVIEW_LINES} of ${all.length} lines` : null
  return emptyPreview(path, { lines: lines.length ? lines : [''], note, eol, crlf, readOnly, mtimeMs })
}

export type Effect =
  | { kind: 'open'; entry: Entry; edit?: true }
  | { kind: 'edit' }
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
    // A note above the code takes one of the rows.
    const last = Math.max(0, p.lines.length - (hasNoteRow(p) ? room - 1 : room))
    const scroll = (top: number) => ({ ex: { ...ex, preview: { ...p, top: clamp(top, 0, last) } }, effect: null })
    if (key === 'backspace' || key === 'left' || key === 'h' || key === 'q') return { ex, effect: { kind: 'up' } }
    if (key === 'down' || key === 'j') return scroll(p.top + 1)
    if (key === 'up' || key === 'k') return scroll(p.top - 1)
    if (key === 'pagedown' || key === 'space' || key === ' ') return scroll(p.top + page)
    if (key === 'pageup') return scroll(p.top - page)
    if (key === 'home' || key === 'g') return scroll(0)
    if (key === 'end' || key === 'G') return scroll(last)
    if (key === '@') return { ex, effect: { kind: 'mention', path: p.path } }
    if (key === 'e') return { ex, effect: { kind: 'edit' } }
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
  if (key === 'e' && current && current.kind !== 'dir') return { ex, effect: { kind: 'open', entry: current, edit: true } }
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

/** A stored or partial agent with every field present, so a card from an older version still draws. */
export function normalizeAgent(a: Partial<Agent> & { id: string }): Agent {
  return {
    name: 'agent',
    type: 'agent',
    model: '',
    task: '',
    startedAt: 0,
    steps: 0,
    ctx: 0,
    out: 0,
    tools: 0,
    lastTool: '',
    isBackground: false,
    ...a,
  }
}
