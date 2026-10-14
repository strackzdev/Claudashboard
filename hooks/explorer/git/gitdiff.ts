// Pure line-diff logic for the gutter: which lines of the buffer are unsaved, added, modified, staged,
// or sit where lines were deleted. No `$` here.
import { isAbsolute, relTo } from '../../shared/paths'

export type Change = 'added' | 'modified'

/** One buffer line's mark: what changed it and at which layer; `deleted` marks lines removed just below it. */
export type LineMark = {
  layer: 'unsaved' | 'unstaged' | 'staged' | null
  change: Change | null
  deleted: boolean
}

export type DiffSummary = { unsaved: number; added: number; modified: number; deleted: number; staged: number }

type Diff = {
  /** Per line of `b`: added or modified relative to `a`, else null. */
  marks: Array<Change | null>
  /** Per line of `b`: lines of `a` were deleted just after it (index -1 → before the first line is folded onto line 0). */
  deletedAfter: boolean[]
  /** Per line of `b`: the line of `a` it is equal to, or -1. */
  toA: Int32Array
  deletedCount: number
}

/** Lines as the preview splits them: CRLF and CR as LF, a final newline dropped. */
export function splitText(text: string): string[] {
  const all = text.replace(/\r\n?/g, '\n').split('\n')
  if (all.length > 1 && all[all.length - 1] === '') all.pop()
  return all
}

/** Edits beyond this make the diff give up and call the changed middle "modified". */
const MAX_EDITS = 2000

type Op = 0 | 1 | 2 // equal, delete (from a), insert (from b)

/** Myers' O(ND) diff of two line arrays: the edit script, or null past MAX_EDITS. */
function myers(a: string[], b: string[]): Op[] | null {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDITS) return null
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0)) ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        // Walk the trace back into an edit script.
        const ops: Op[] = []
        let cx = n
        let cy = m
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd] ?? v
          const ck = cx - cy
          const down = ck === -dd || (ck !== dd && (pv[offset + ck - 1] ?? 0) < (pv[offset + ck + 1] ?? 0))
          const pk = down ? ck + 1 : ck - 1
          const px = pv[offset + pk] ?? 0
          const py = px - pk
          while (cx > px && cy > py) {
            ops.push(0)
            cx--
            cy--
          }
          ops.push(down ? 2 : 1)
          if (down) cy--
          else cx--
        }
        while (cx > 0 && cy > 0) {
          ops.push(0)
          cx--
          cy--
        }
        return ops.reverse()
      }
    }
  }
  return null
}

/** What changed from `a` to `b`, per line of `b`. */
export function diffLines(a: readonly string[], b: readonly string[]): Diff {
  const marks: Array<Change | null> = new Array(b.length).fill(null)
  const deletedAfter: boolean[] = new Array(b.length).fill(false)
  const toA = new Int32Array(b.length).fill(-1)
  let deletedCount = 0

  // Common prefix and suffix first: most edits touch a few lines in the middle.
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) {
    toA[pre] = pre
    pre++
  }
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) {
    toA[b.length - 1 - suf] = a.length - 1 - suf
    suf++
  }
  const midA = a.slice(pre, a.length - suf)
  const midB = b.slice(pre, b.length - suf)
  if (midA.length === 0 && midB.length === 0) return { marks, deletedAfter, toA, deletedCount }

  const markDeleted = (bAt: number) => {
    // Deleted lines show on the line above them; deleted from the very top, on the first line.
    const at = Math.max(0, Math.min(b.length - 1, bAt))
    if (b.length > 0) deletedAfter[at] = true
  }

  const ops = myers(midA, midB)
  if (!ops) {
    // Too different to align: the whole changed middle reads as modified.
    for (let i = 0; i < midB.length; i++) marks[pre + i] = 'modified'
    if (midA.length > midB.length) {
      deletedCount += midA.length - midB.length
      markDeleted(pre + midB.length - 1)
    }
    return { marks, deletedAfter, toA, deletedCount }
  }

  let ia = 0
  let ib = 0
  let k = 0
  while (k < ops.length) {
    if (ops[k] === 0) {
      toA[pre + ib] = pre + ia
      ia++
      ib++
      k++
      continue
    }
    // A hunk: the deletes and inserts between two equal lines.
    let dels = 0
    let ins = 0
    const startB = ib
    while (k < ops.length && ops[k] !== 0) {
      if (ops[k] === 1) dels++
      else ins++
      k++
    }
    const paired = Math.min(dels, ins)
    for (let i = 0; i < ins; i++) marks[pre + startB + i] = i < paired ? 'modified' : 'added'
    if (dels > ins) {
      deletedCount += dels - ins
      markDeleted(pre + startB + ins - 1)
    }
    ia += dels
    ib += ins
  }
  return { marks, deletedAfter, toA, deletedCount }
}

/**
 * The gutter for the buffer, layered as git shows a file: unsaved edits (buffer against disk) first,
 * then unstaged changes (disk against the index), then staged ones (the index against HEAD).
 * Without git, `index` and `head` are the text as first opened, so saved edits still show.
 */
export function lineMarks(o: { head: readonly string[]; index: readonly string[]; disk: readonly string[]; buffer: readonly string[] }): {
  marks: LineMark[]
  summary: DiffSummary
} {
  const unsaved = diffLines(o.disk, o.buffer)
  const unstaged = diffLines(o.index, o.disk)
  const staged = diffLines(o.head, o.index)
  const summary: DiffSummary = { unsaved: 0, added: 0, modified: 0, deleted: 0, staged: 0 }

  const marks: LineMark[] = o.buffer.map((_, i) => {
    const u = unsaved.marks[i]
    if (u || unsaved.deletedAfter[i]) {
      summary.unsaved += u ? 1 : 0
      return { layer: 'unsaved', change: u ?? null, deleted: unsaved.deletedAfter[i] === true }
    }
    const j = unsaved.toA[i] ?? -1
    if (j < 0) return { layer: null, change: null, deleted: false }
    const w = unstaged.marks[j]
    if (w || unstaged.deletedAfter[j]) {
      if (w === 'added') summary.added++
      if (w === 'modified') summary.modified++
      return { layer: 'unstaged', change: w ?? null, deleted: unstaged.deletedAfter[j] === true }
    }
    const k = unstaged.toA[j] ?? -1
    if (k < 0) return { layer: null, change: null, deleted: false }
    const s = staged.marks[k]
    if (s || staged.deletedAfter[k]) {
      summary.staged += s ? 1 : 0
      return { layer: 'staged', change: s ?? null, deleted: staged.deletedAfter[k] === true }
    }
    return { layer: null, change: null, deleted: false }
  })
  summary.deleted = unsaved.deletedCount + unstaged.deletedCount
  return { marks, summary }
}

/** `git status --porcelain=v1 -z` → path (relative to the repo's top) → its two status letters. */
export function parsePorcelain(out: string): Map<string, string> {
  const map = new Map<string, string>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? ''
    if (entry.length < 4 || entry.startsWith('## ')) continue
    const xy = entry.slice(0, 2)
    map.set(entry.slice(3), xy)
    // A rename or copy is followed by its old path, which has no status of its own.
    if (xy[0] === 'R' || xy[0] === 'C') i++
  }
  return map
}

/** The one letter the file list shows for a file's two status letters, and how to colour it. */
export function statusLetter(xy: string): { letter: string; tone: 'staged' | 'modified' | 'untracked' | 'deleted' | 'conflict' } | null {
  if (xy === '??') return { letter: 'U', tone: 'untracked' }
  const x = xy[0] ?? ' '
  const y = xy[1] ?? ' '
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return { letter: '!', tone: 'conflict' }
  if (y === 'D') return { letter: 'D', tone: 'deleted' }
  if (y !== ' ') return { letter: 'M', tone: 'modified' }
  if (x !== ' ') return { letter: x === 'A' ? 'A' : 'S', tone: 'staged' }
  return null
}

/** The `## branch...upstream [ahead 1, behind 2]` header of `git status -b`. */
export function parseBranch(out: string): { branch: string; ahead: number; behind: number } {
  const header = out.split('\0').find(p => p.startsWith('## ')) ?? ''
  const h = header.slice(3)
  const ahead = Number(/ahead (\d+)/.exec(h)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(h)?.[1] ?? 0)
  let branch = h.replace(/\s*\[.*\]$/, '').split('...')[0] ?? ''
  if (branch.startsWith('No commits yet on ')) branch = branch.slice('No commits yet on '.length)
  if (branch.startsWith('HEAD (no branch)')) branch = 'detached'
  return { branch: branch || '?', ahead, behind }
}

/** Counts of changed (unstaged or untracked) and staged files in a status map. */
export function countStatus(status: Map<string, string>): { changed: number; staged: number } {
  let changed = 0
  let staged = 0
  for (const xy of status.values()) {
    if (xy === '??' || (xy[1] ?? ' ') !== ' ') changed++
    if (xy !== '??' && (xy[0] ?? ' ') !== ' ') staged++
  }
  return { changed, staged }
}

/** The files git reports changed, as paths from `root`: deleted files (nothing to open) and files outside `root` left out. */
export function changedUnder(root: string, top: string, status: Map<string, string>): string[] {
  return [...status.entries()]
    .filter(([, xy]) => !xy.includes('D'))
    .map(([rel]) => relTo(root, `${top}/${rel}`))
    .filter(path => !isAbsolute(path))
}
