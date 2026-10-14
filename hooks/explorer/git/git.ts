// git for the explorer: the status letters and project bar, and what the open file's gutter compares against.
import type { EngineInterface } from 'claude-code'
import type { Entry, RepoInfo } from '../../../types'
import { changedUnder, countStatus, parseBranch, parsePorcelain, splitText } from './gitdiff'
import { baseName, parentOf, relTo } from '../../shared/paths'
import { absOf, bumpGitTick, getExplorer, sameLines, updateExplorer } from '../../state'

/** What each open file is compared against: git's HEAD and index, or (outside git) the text as first opened. */
export type Base = { repo: boolean; head: string[]; index: string[] }
export const bases = new Map<string, Base>()
/** The text of each file as first opened this session: the base outside git. */
export const opened = new Map<string, string[]>()
const fetching = new Set<string>()

function git($: EngineInterface, cwd: string, args: string[]) {
  return $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 5000 }).catch(() => ({ exitCode: -1, stdout: '', stderr: '' }))
}

/** The repository's top folder holding `dir`, or null outside git. */
async function repoTop($: EngineInterface, dir: string): Promise<string | null> {
  const r = await git($, dir, ['rev-parse', '--show-toplevel'])
  return r.exitCode === 0 ? r.stdout.trim() || null : null
}

/** Reads HEAD's and the index's copy of the open file, then redraws its gutter. */
export async function fetchBase($: EngineInterface, root: string, path: string) {
  if (fetching.has(path)) return
  fetching.add(path)
  try {
    const abs = absOf(root, path)
    const top = await repoTop($, parentOf(abs) || '/')
    const first = opened.get(path) ?? []
    let base: Base
    if (!top) {
      base = { repo: false, head: first, index: first }
    } else {
      const rel = relTo(top, abs)
      const [head, index] = await Promise.all([git($, top, ['show', `HEAD:${rel}`]), git($, top, ['show', `:${rel}`])])
      // Not in HEAD (a new file) or not in the index (untracked): every line counts as added.
      base = {
        repo: true,
        head: head.exitCode === 0 ? splitText(head.stdout) : [],
        index: index.exitCode === 0 ? splitText(index.stdout) : [],
      }
    }
    const old = bases.get(path)
    if (old && old.repo === base.repo && sameLines(old.head, base.head) && sameLines(old.index, base.index)) return
    bases.set(path, base)
    await bumpGitTick($)
  } finally {
    fetching.delete(path)
  }
}

/** One `git status` of the repository holding `dir`: each changed file's two letters, keyed by its path from `top`. */
export type RepoStatus = { top: string; status: Map<string, string>; repo: RepoInfo }

/** The status of the repository holding `dir`, or null outside git. */
export async function repoStatus($: EngineInterface, root: string, dir: string): Promise<RepoStatus | null> {
  const top = await repoTop($, absOf(root, dir))
  if (!top) return null
  const r = await git($, top, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all'])
  if (r.exitCode !== 0) return null
  const status = parsePorcelain(r.stdout)
  const changedFiles = changedUnder(root, top, status)
  return { top, status, repo: { name: baseName(top), ...parseBranch(r.stdout), ...countStatus(status), changedFiles } }
}

/** The entries with git's letters: a letter per changed file, a dot on folders holding changes. */
export function withGit(entries: Entry[], s: RepoStatus | null, root: string): Entry[] {
  const plain = entries.map(e => (e.git === undefined ? e : { ...e, git: undefined }))
  if (!s) return plain
  const keys = [...s.status.keys()]
  return plain.map(e => {
    const rel = relTo(s.top, absOf(root, e.path))
    if (e.kind === 'dir') return keys.some(k => k.startsWith(`${rel}/`)) ? { ...e, git: '•' } : e
    const xy = s.status.get(rel)
    return xy ? { ...e, git: xy } : e
  })
}

/**
 * git status for the entries of `dir`, from one `git status` of its whole repository: the letters,
 * and the project bar's branch and counts. Outside a repository, nothing is asked of git beyond finding that out.
 */
export async function gitStatusOf($: EngineInterface, root: string, dir: string, entries: Entry[]): Promise<{ entries: Entry[]; repo: RepoInfo | null }> {
  const s = await repoStatus($, root, dir)
  return { entries: withGit(entries, s, root), repo: s?.repo ?? null }
}

/** Refreshes the git letters and project bar of the folder on screen, and the open file's base. */
export async function refreshGit($: EngineInterface) {
  const ex = await getExplorer($)
  if (ex.preview) await fetchBase($, ex.root, ex.preview.path)
  if (ex.onlyTouched) return
  const { entries, repo } = await gitStatusOf($, ex.root, ex.dir, ex.entries)
  await updateExplorer($, cur => (cur.dir === ex.dir ? { ...cur, entries, repo } : cur))
}

/** Every file git knows under `root` (tracked, and untracked but not ignored), as paths from it; null outside git. */
// ponytail: a tracked file deleted on disk (or a submodule) still lists; opening it says it cannot be read. Filter with `ls-files --deleted` if that bothers anyone.
export async function repoFiles($: EngineInterface, root: string): Promise<string[] | null> {
  const r = await git($, root, ['-c', 'core.quotePath=false', 'ls-files', '--cached', '--others', '--exclude-standard'])
  if (r.exitCode !== 0) return null
  return [...new Set(r.stdout.split('\n').filter(Boolean))]
}
