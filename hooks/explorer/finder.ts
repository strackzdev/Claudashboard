// Pure logic for Claudashboard: the fuzzy file finder's matching and keys. No `$` here, so it is testable.
import type { Finder } from '../../types'
import type { Key } from './model'
import { clamp } from '../shared/format'

/** The most files the finder searches, and the most results it ranks. */
export const MAX_FILES = 20_000
export const MAX_RESULTS = 200

export type Match = { path: string; score: number; hits: number[] }

const isBoundary = (path: string, i: number) => i === 0 || '/._- '.includes(path[i - 1] ?? '')

/** The query's letters in order inside `from..` of `path` (case ignored), each at its earliest place; null when they are not all there. */
function subsequence(lower: string, q: string, from: number): number[] | null {
  const hits: number[] = []
  let at = from
  for (const ch of q) {
    const i = lower.indexOf(ch, at)
    if (i < 0) return null
    hits.push(i)
    at = i + 1
  }
  return hits
}

/**
 * How well `query` matches `path`, as a fuzzy finder ranks it: the query's letters in order, preferring the
 * file's own name, letters in a row, and the starts of words. Null when the letters are not all there.
 */
export function fuzzyMatch(query: string, path: string): Match | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return { path, score: 0, hits: [] }
  const lower = path.toLowerCase()
  const nameAt = lower.lastIndexOf('/') + 1
  // The whole query inside the file's name beats letters spread over its folders.
  const inName = subsequence(lower, q, nameAt)
  const hits = inName ?? subsequence(lower, q, 0)
  if (!hits) return null
  let score = inName ? 20 : 0
  hits.forEach((i, n) => {
    score += 1
    if (n > 0 && hits[n - 1] === i - 1) score += 5
    if (isBoundary(path, i)) score += 4
  })
  if (lower.slice(nameAt).startsWith(q)) score += 10
  return { path, score: score - path.length / 100, hits }
}

/** The files matching `query`, best first (shorter paths first among equals); with no query, the files as listed. */
export function findFiles(files: readonly string[], query: string, limit = MAX_RESULTS): Match[] {
  if (!query.trim()) return files.slice(0, limit).map(path => ({ path, score: 0, hits: [] }))
  const found: Match[] = []
  for (const f of files) {
    const m = fuzzyMatch(query, f)
    if (m) found.push(m)
  }
  return found.sort((a, b) => b.score - a.score || a.path.length - b.path.length).slice(0, limit)
}

export type FinderEffect = { kind: 'open'; path: string } | { kind: 'close' } | null

/** One key against the open finder: the next finder, and whether to open a file or close it. */
export function reduceFinder(f: Finder, k: Key, room: number): { finder: Finder; effect: FinderEffect } {
  const key = k.key
  const results = findFiles(f.files, f.query)
  const move = (c: number) => ({ finder: { ...f, cursor: clamp(c, 0, Math.max(0, results.length - 1)) }, effect: null })
  if (key === 'return') {
    const picked = results[clamp(f.cursor, 0, Math.max(0, results.length - 1))]
    return { finder: f, effect: picked ? { kind: 'open', path: picked.path } : null }
  }
  if (key === 'down' || (k.ctrl && key === 'n')) return move(f.cursor + 1)
  if (key === 'up' || (k.ctrl && key === 'p')) return move(f.cursor - 1)
  if (key === 'pagedown') return move(f.cursor + Math.max(1, room - 1))
  if (key === 'pageup') return move(f.cursor - Math.max(1, room - 1))
  if (key === 'backspace') {
    if (!f.query) return { finder: f, effect: { kind: 'close' } }
    return { finder: { ...f, query: f.query.slice(0, -1), cursor: 0 }, effect: null }
  }
  if (k.ctrl && key === 'u') return { finder: { ...f, query: '', cursor: 0 }, effect: null }
  if (key === 'space') return { finder: { ...f, query: `${f.query} `, cursor: 0 }, effect: null }
  if (key.length === 1 && !k.ctrl && !k.meta) return { finder: { ...f, query: f.query + key, cursor: 0 }, effect: null }
  return { finder: f, effect: null }
}
