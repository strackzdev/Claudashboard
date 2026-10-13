// Pure logic for the in-pane editor: keys against the text, cursor and display columns. No `$` here.
import type { Preview } from '../types'
import { hasNoteRow } from './core'
import type { Key } from './core'

/** Cells a tab takes on screen; the cursor's display column counts it so. */
export const TAB = 2

/** Key names the surface sends that are not text. */
const NAMED = new Set([
  'up', 'down', 'left', 'right', 'return', 'enter', 'tab', 'backspace', 'delete', 'pageup', 'pagedown',
  'home', 'end', 'escape', 'insert', 'space',
])

export type EditEffect = 'save' | 'exit' | 'undo' | null

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** A line as drawn: tabs as TAB spaces. */
export const displayOf = (line: string) => line.replace(/\t/g, ' '.repeat(TAB))

/** The display column of character `col` in `line`. */
export function visualCol(line: string, col: number): number {
  let v = 0
  for (let i = 0; i < col && i < line.length; i++) v += line[i] === '\t' ? TAB : 1
  return v
}

/** The character index under display column `v` in `line`: what a click lands on. */
export function colFromVisual(line: string, v: number): number {
  let x = 0
  for (let i = 0; i < line.length; i++) {
    const w = line[i] === '\t' ? TAB : 1
    if (v < x + w) return i
    x += w
  }
  return line.length
}

/** The file's text from the lines, in the shape it was read: its line endings and final newline kept. */
export function textOf(p: Preview): string {
  const nl = p.crlf ? '\r\n' : '\n'
  return p.lines.join(nl) + (p.eol ? nl : '')
}

/** Scrolls so the cursor's line is in view. */
export function follow(p: Preview, room: number): Preview {
  const rows = Math.max(1, hasNoteRow(p) ? room - 1 : room)
  const top = p.row < p.top ? p.row : p.row >= p.top + rows ? p.row - rows + 1 : p.top
  return { ...p, top: clamp(top, 0, Math.max(0, p.lines.length - 1)) }
}

/** Puts the cursor at a line and character, both clamped to the text. */
export function place(p: Preview, row: number, col: number): Preview {
  const r = clamp(row, 0, Math.max(0, p.lines.length - 1))
  return { ...p, row: r, col: clamp(col, 0, (p.lines[r] ?? '').length), confirm: null }
}

function insert(p: Preview, text: string): Preview {
  const parts = text.replace(/\r\n?/g, '\n').split('\n')
  const line = p.lines[p.row] ?? ''
  const before = line.slice(0, p.col)
  const after = line.slice(p.col)
  const lines = [...p.lines]
  if (parts.length === 1) {
    lines[p.row] = before + text + after
    return { ...p, lines, col: p.col + text.length }
  }
  const last = parts[parts.length - 1] ?? ''
  const middle = parts.slice(1, -1)
  lines.splice(p.row, 1, before + (parts[0] ?? ''), ...middle, last + after)
  return { ...p, lines, row: p.row + parts.length - 1, col: last.length }
}

/**
 * One key against the editor: the next preview, whether the text changed (so the caller keeps an undo
 * step), and the I/O the hooks module owes for it. `room` is how many rows the code area shows.
 */
export function reduceEdit(p: Preview, k: Key, room: number): { p: Preview; changed: boolean; effect: EditEffect } {
  const key = k.key
  const line = p.lines[p.row] ?? ''
  const page = Math.max(1, room - 2)
  const moved = (row: number, col: number) => ({ p: follow(place(p, row, col), room), changed: false, effect: null })
  const edited = (next: Preview) => ({ p: follow({ ...next, dirty: true, status: null, confirm: null }, room), changed: true, effect: null })

  if (k.ctrl) {
    if (key === 's') return { p, changed: false, effect: 'save' }
    if (key === 'e') return { p, changed: false, effect: 'exit' }
    if (key === 'z') return { p, changed: false, effect: 'undo' }
    if (key === 'home') return moved(0, 0)
    if (key === 'end') return moved(p.lines.length - 1, (p.lines[p.lines.length - 1] ?? '').length)
    return { p, changed: false, effect: null }
  }
  if (k.meta) return { p, changed: false, effect: null }

  switch (key) {
    case 'up':
      return moved(p.row - 1, Math.min(p.col, (p.lines[p.row - 1] ?? '').length))
    case 'down':
      return moved(p.row + 1, Math.min(p.col, (p.lines[p.row + 1] ?? '').length))
    case 'left':
      return p.col > 0 ? moved(p.row, p.col - 1) : p.row > 0 ? moved(p.row - 1, (p.lines[p.row - 1] ?? '').length) : moved(0, 0)
    case 'right':
      return p.col < line.length ? moved(p.row, p.col + 1) : p.row < p.lines.length - 1 ? moved(p.row + 1, 0) : moved(p.row, p.col)
    case 'home': {
      // First to the line's indentation, then to its very start.
      const indent = line.length - line.trimStart().length
      return moved(p.row, p.col === indent ? 0 : indent)
    }
    case 'end':
      return moved(p.row, line.length)
    case 'pageup':
      return moved(p.row - page, p.col)
    case 'pagedown':
      return moved(p.row + page, p.col)
    case 'return':
    case 'enter': {
      // The new line keeps the current one's indentation.
      const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
      return edited(insert(p, `\n${indent.slice(0, Math.min(indent.length, p.col))}`))
    }
    case 'tab':
      return edited(insert(p, p.lines.some(l => l.startsWith('\t')) ? '\t' : '  '))
    case 'space':
      return edited(insert(p, ' '))
    case 'backspace': {
      if (p.col > 0) {
        const lines = [...p.lines]
        lines[p.row] = line.slice(0, p.col - 1) + line.slice(p.col)
        return edited({ ...p, lines, col: p.col - 1 })
      }
      if (p.row === 0) return { p, changed: false, effect: null }
      const prev = p.lines[p.row - 1] ?? ''
      const lines = [...p.lines]
      lines.splice(p.row - 1, 2, prev + line)
      return edited({ ...p, lines, row: p.row - 1, col: prev.length })
    }
    case 'delete': {
      if (p.col < line.length) {
        const lines = [...p.lines]
        lines[p.row] = line.slice(0, p.col) + line.slice(p.col + 1)
        return edited({ ...p, lines })
      }
      if (p.row >= p.lines.length - 1) return { p, changed: false, effect: null }
      const lines = [...p.lines]
      lines.splice(p.row, 2, line + (p.lines[p.row + 1] ?? ''))
      return edited({ ...p, lines })
    }
  }
  // A typed character, or a paste arriving as one longer string.
  if (key.length === 1 || (key.length > 1 && !NAMED.has(key) && !/^f\d{1,2}$/.test(key))) return edited(insert(p, key))
  return { p, changed: false, effect: null }
}
