// The explorer's I/O: folder listings, the preview's file, and the live refresh.
import type { EngineInterface } from 'claude-code'
import type { Entry, Explorer, Preview, RepoInfo } from '../../types'
import { MAX_PREVIEW_BYTES, emptyPreview, previewOf, sortEntries, touchedEntries, visibleEntries } from './model'
import { bases, fetchBase, gitStatusOf, opened, repoFiles, repoStatus, withGit } from './git/git'
import { MAX_FILES } from './finder'
import { diffRows } from './git/gitdiff'
import { kindOf } from './media/media'
import { joinPath, parentOf, relTo, toSlash } from '../shared/paths'
import { loadPicture } from './media/picture'
import { absOf, changedOnDisk, getExplorer, logged, getTouched, history, paneState, saved, setPreview, updateExplorer, updateTouched } from '../state'

/** Whether two listings show the same thing: names, sizes, times and git letters. */
const sameListing = (a: Entry[], b: Entry[]) =>
  a.length === b.length &&
  a.every((e, i) => {
    const o = b[i]
    return o !== undefined && e.path === o.path && e.kind === o.kind && e.size === o.size && e.mtimeMs === o.mtimeMs && e.git === o.git
  })

let isPolling = false

/**
 * Every few seconds while the pane is open: the folder's listing and git status, and the open file
 * if it changed on disk (edited in another editor). Writes, and so redraws, only what changed.
 */
export async function poll($: EngineInterface) {
  if (isPolling || !paneState.isOpen) return
  isPolling = true
  try {
    const ex = await getExplorer($)
    if (!ex.root) return
    if (ex.preview) {
      const p = ex.preview
      const st = await $.fs.stat(absOf(ex.root, p.path)).catch(() => null)
      if (changedOnDisk(st, p)) await reloadChanged($, p, false)
      await fetchBase($, ex.root, p.path)
    }
    const listing = await listingOf($, ex, ex.dir).catch(() => null)
    if (!listing) return
    const { entries, repo } = listing
    const sameRepo = JSON.stringify(repo ?? null) === JSON.stringify(ex.repo ?? null)
    if (sameRepo && sameListing(entries, ex.entries)) return
    await updateExplorer($, cur => {
      if (cur.dir !== ex.dir) return cur
      // Keep the cursor on the same entry when files come and go.
      // The cursor indexes the visible rows, not every entry.
      const at = visibleEntries(cur)[cur.cursor]?.path
      const next = { ...cur, entries, repo }
      const rows = visibleEntries(next)
      const idx = at ? rows.findIndex(e => e.path === at) : -1
      return { ...next, cursor: idx >= 0 ? idx : Math.min(cur.cursor, Math.max(0, rows.length - 1)) }
    })
  } finally {
    isPolling = false
  }
}

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

/**
 * What the explorer lists, with git's letters: the folder `dir`, or the touched view. Inside a repository
 * the touched view is what git reports changed, so a reverted file leaves it; outside git, the files Claude edited.
 */
async function listingOf($: EngineInterface, ex: Explorer, dir: string): Promise<{ entries: Entry[]; repo: RepoInfo | null }> {
  if (!ex.onlyTouched) {
    const listed = await listDir($, ex.root, dir)
    return gitStatusOf($, ex.root, dir, listed).catch(() => ({ entries: listed, repo: null }))
  }
  const s = await repoStatus($, ex.root, '')
  if (!s) return { entries: touchedEntries(await getTouched($)), repo: null }
  // ponytail: one stat per changed file each poll; cap it if a repo without a .gitignore lists thousands.
  const entries = await Promise.all(
    s.repo.changedFiles.map(async path => {
      const st = await $.fs.stat(absOf(ex.root, path)).catch(() => null)
      return { name: path, path, kind: 'file' as const, size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0 }
    }),
  )
  return { entries: withGit(entries, s, ex.root), repo: s.repo }
}

/** Loads `dir` into the explorer, the cursor on `select` when it is there. */
export async function loadDir($: EngineInterface, dir: string, select?: string) {
  const ex = await getExplorer($)
  try {
    const { entries, repo } = await listingOf($, ex, dir)
    await updateExplorer($, x => {
      const next: Explorer = { ...x, dir, entries, repo, preview: null, error: null, cursor: 0 }
      const at = select ? visibleEntries(next).findIndex(e => e.path === select) : -1
      return { ...next, cursor: Math.max(0, at) }
    })
  } catch (err) {
    await updateExplorer($, x => ({ ...x, error: `cannot open ${dir || '.'}: ${String(err)}` }))
  }
}

/** Reads `path` into the preview; `keep` carries the mode, cursor and scroll over a reload. */
export async function loadPreview($: EngineInterface, path: string, keep: Partial<Preview> = {}) {
  const ex = await getExplorer($)
  const abs = absOf(ex.root, path)
  try {
    const st = await $.fs.stat(abs)
    const kind = kindOf(path)
    if (kind === 'image') {
      const picture = await loadPicture($, abs, st.size, st.mtimeMs)
      await updateExplorer($, x => ({
        ...x,
        error: null,
        preview: emptyPreview(path, { kind: 'image', lines: [], mtimeMs: st.mtimeMs, readOnly: 'picture', ...picture }),
      }))
      return
    }
    const text = st.size > MAX_PREVIEW_BYTES ? '' : await $.fs.read(abs)
    const fresh: Preview = { ...previewOf(path, text, st.size, st.mtimeMs), kind, mdView: keep.mdView ?? 'rendered' }
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
    if (!opened.has(path)) opened.set(path, fresh.lines)
    bases.delete(path)
    void fetchBase($, ex.root, path).catch(logged($, 'fetchBase'))
    await updateExplorer($, x => ({ ...x, preview, error: null }))
  } catch (err) {
    await updateExplorer($, x => ({ ...x, error: `cannot read ${path}: ${String(err)}` }))
  }
}

/** The open file changed on disk: show the new text, or warn once when the person has unsaved edits. */
export async function reloadChanged($: EngineInterface, p: Preview, isByClaude: boolean) {
  if (!p.dirty) {
    const status = isByClaude ? 'reloaded: Claude changed this file' : 'reloaded: changed on disk'
    return loadPreview($, p.path, { mode: p.mode, top: p.top, row: p.row, col: p.col, status })
  }
  if (p.confirm === 'overwrite' || p.status?.includes('changed on disk')) return
  const who = isByClaude ? 'Claude changed this file' : 'the file changed'
  await setPreview($, x => ({ ...x, status: `${who} on disk: saving will ask before overwriting` }))
}

/** Records a file Claude edited, and shows it in the folder on screen. */
export async function noteEdit($: EngineInterface, e: unknown) {
  const input = e as unknown as { file_path?: unknown; notebook_path?: unknown }
  const given = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null
  if (!given) return
  const abs = toSlash(given)
  const ex = await getExplorer($)
  const path = relTo(ex.root, abs)
  await updateTouched($, t => ({ ...t, [path]: (t[path] ?? 0) + 1 }))
  // The file open in the preview changed under it: show the new text, unless the person has unsaved edits.
  if (ex.preview && ex.preview.path === path) await reloadChanged($, ex.preview, true)
  // A new file in the folder on screen shows without a manual refresh.
  if (!ex.preview && !ex.onlyTouched && parentOf(path) === ex.dir && !ex.entries.some(x => x.path === path)) await loadDir($, ex.dir)
  if (ex.onlyTouched) await loadDir($, ex.dir)
}

/** The diff view of the file in the preview: its text against git's HEAD, or outside git the text as first opened. */
export async function openDiff($: EngineInterface) {
  const ex = await getExplorer($)
  const p = ex.preview
  if (!p) return
  const base = bases.get(p.path)
  if (!base) {
    void fetchBase($, ex.root, p.path).catch(logged($, 'fetchBase'))
    return setPreview($, x => ({ ...x, status: "reading git's copy of the file: press d again in a moment" }))
  }
  const rows = diffRows(base.head, p.lines)
  if (rows.length === 0) return setPreview($, x => ({ ...x, status: base.repo ? 'no changes since the last commit' : 'no changes since the file was opened' }))
  await setPreview($, x => ({ ...x, diff: { rows, fileTop: x.top }, top: 0, status: null }))
}

/** Folders a walk outside git never enters: they hold thousands of files nobody searches for. */
const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.venv', '__pycache__'])

/** Every file under the root outside git, folder by folder, dotfolders only with dotfiles shown; at most MAX_FILES. */
async function walkFiles($: EngineInterface, root: string, showHidden: boolean): Promise<string[]> {
  const files: string[] = []
  const queue = ['']
  while (queue.length && files.length < MAX_FILES) {
    const dir = queue.shift() ?? ''
    const raw = await $.fs.list(joinPath(root, dir)).catch(() => [])
    for (const r of raw) {
      if (SKIP.has(r.name) || (!showHidden && r.name.startsWith('.'))) continue
      const path = dir ? `${dir}/${r.name}` : r.name
      // A symbolic link lists as `other`: walk or list it as what it leads to.
      const kind = r.isLink ? ((await $.fs.stat(joinPath(root, path)).catch(() => null))?.kind ?? null) : r.kind
      if (kind === 'dir' && !r.isLink) queue.push(path)
      else if (kind === 'file') files.push(path)
    }
  }
  return files.slice(0, MAX_FILES)
}

/** Opens the fuzzy finder, then fills in the files it searches: git's list in a repository, else a walk. */
export async function openFinder($: EngineInterface) {
  const ex = await getExplorer($)
  await updateExplorer($, x => ({ ...x, isFiltering: false, finder: { query: '', cursor: 0, files: x.finder?.files ?? [], isLoading: true } }))
  const files = ((await repoFiles($, ex.root)) ?? (await walkFiles($, ex.root, ex.showHidden))).slice(0, MAX_FILES)
  await updateExplorer($, x => (x.finder ? { ...x, finder: { ...x.finder, files, isLoading: false } } : x))
}

/** Opens a file the finder picked: its folder listed with the cursor on it, then the file itself. */
export async function openFound($: EngineInterface, path: string) {
  await updateExplorer($, x => ({ ...x, finder: null, onlyTouched: false, filter: '' }))
  await loadDir($, parentOf(path), path)
  await loadPreview($, path)
}
