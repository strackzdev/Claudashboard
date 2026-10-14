// Pure logic for STRACKZDEVHUB: the explorer's state, its preview, and its key reducer. No `$` here, so it is testable.
import type { Entry, Explorer, Preview } from '../../types'
import { clamp, clipEnd, fmtSize } from '../shared/format'

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
    kind: 'text',
    mdView: 'rendered',
    image: null,
    ...over,
  }
}

/** Whether a note or status line sits above the code, taking one of its rows. */
export const hasNoteRow = (p: Preview) => Boolean(p.note || p.status || p.readOnly)

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
  const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/ // no g: .test must not carry lastIndex between lines
  let readOnly: string | null = null
  if (/\r(?!\n)/.test(text) || (crlf && /(?<!\r)\n/.test(text))) readOnly = 'mixed line endings'
  else if (all.some(l => CONTROL.test(l))) readOnly = 'control characters in the file'
  else if (all.some(l => l.length > MAX_LINE)) {
    readOnly = `line ${all.findIndex(l => l.length > MAX_LINE) + 1} is longer than ${MAX_LINE} characters`
  } else if (all.length > MAX_PREVIEW_LINES) readOnly = `longer than ${MAX_PREVIEW_LINES} lines`
  const strip = new RegExp(CONTROL, 'g')
  const lines = all.slice(0, MAX_PREVIEW_LINES).map(l => clipEnd(l.replace(strip, ''), MAX_LINE))
  const note = all.length > MAX_PREVIEW_LINES ? `showing the first ${MAX_PREVIEW_LINES} of ${all.length} lines` : null
  return emptyPreview(path, { lines: lines.length ? lines : [''], note, eol, crlf, readOnly, mtimeMs })
}

export type Effect =
  { kind: 'open'; entry: Entry; edit?: true } | { kind: 'edit' } | { kind: 'up' } | { kind: 'mention'; path: string } | { kind: 'reload' } | null

export type Key = { key: string; ctrl?: true; meta?: true; shift?: true }

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
    if (key === 'r') return { ex, effect: { kind: 'reload' } }
    if (key === 'm' && p.kind === 'markdown') {
      return { ex: { ...ex, preview: { ...p, mdView: p.mdView === 'source' ? 'rendered' : 'source' } }, effect: null }
    }
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
