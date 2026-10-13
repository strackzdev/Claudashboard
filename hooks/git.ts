// git for the explorer: the status letters and project bar, and what the open file's gutter compares against.
import type { EngineInterface } from 'claude-code'
import type { Entry, RepoInfo } from '../types'
import { countStatus, parseBranch, parsePorcelain, splitText } from './gitdiff'
import { baseName, parentOf, relTo } from './paths'
import { absOf, bumpGitTick, getExplorer, sameLines, updateExplorer } from './state'

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

/**
 * git status for the entries of `dir`, from one `git status` of its whole repository: a letter per
 * changed file, a dot on folders holding changes, and the project bar's branch and counts.
 * Outside a repository, nothing is asked of git beyond finding that out.
 */
export async function gitStatusOf($: EngineInterface, root: string, dir: string, entries: Entry[]): Promise<{ entries: Entry[]; repo: RepoInfo | null }> {
  const plain = entries.map(e => (e.git === undefined ? e : { ...e, git: undefined }))
  const top = await repoTop($, absOf(root, dir))
  if (!top) return { entries: plain, repo: null }
  const r = await git($, top, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all'])
  if (r.exitCode !== 0) return { entries: plain, repo: null }
  const status = parsePorcelain(r.stdout)
  const keys = [...status.keys()]
  const repo: RepoInfo = { name: baseName(top), ...parseBranch(r.stdout), ...countStatus(status) }
  return {
    repo,
    entries: plain.map(e => {
      const rel = relTo(top, absOf(root, e.path))
      if (e.kind === 'dir') return keys.some(k => k.startsWith(`${rel}/`)) ? { ...e, git: '•' } : e
      const xy = status.get(rel)
      return xy ? { ...e, git: xy } : e
    }),
  }
}

/** Refreshes the git letters and project bar of the folder on screen, and the open file's base. */
export async function refreshGit($: EngineInterface) {
  const ex = await getExplorer($)
  if (ex.preview) await fetchBase($, ex.root, ex.preview.path)
  if (ex.onlyTouched) return
  const { entries, repo } = await gitStatusOf($, ex.root, ex.dir, ex.entries)
  await updateExplorer($, cur => (cur.dir === ex.dir ? { ...cur, entries, repo } : cur))
}
