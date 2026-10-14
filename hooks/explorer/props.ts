// Pure logic for Claudashboard: the props the explorer client draws, from the stored state. No `$` here, so it is testable.
import type { Activity, Agent, Entry, Explorer, View } from '../../types'
import { displayOf, visualCol } from './editor/editor'
import type { ExplorerProps, GutterMark, Hint, Palette } from './client'
import { MAX_DRAWN, selRange, visibleEntries, windowTop } from './model'
import { MAX_RESULTS, findFiles } from './finder'
import { agentLines } from '../agents/view'
import { helpLines } from '../help'
import { clamp, clipEnd, fmtAge, fmtSize } from '../shared/format'
import type { Base } from './git/git'
import type { LineMark } from './git/gitdiff'
import { lineMarks, statusLetter } from './git/gitdiff'
import { fitHeader } from './header'
import { renderMarkdown } from './media/markdown'
import { baseName } from '../shared/paths'

const HELP: Hint = { key: '?', label: 'help' }

/** One gutter cell: a bar for an added or modified line, a low bar where lines were deleted. */
function gutterMark(m: LineMark): GutterMark | null {
  if (!m.layer) return null
  return { glyph: m.change ? '▌' : '▁', tone: m.layer === 'unsaved' ? 'unsaved' : m.layer === 'staged' ? 'staged' : (m.change ?? 'deleted') }
}

/**
 * The explorer's props: the list or the open file, `room` rows tall and `width` cells wide.
 * `base` is what the open file's gutter compares against, `disk` its text as last read or saved.
 */
export function explorerProps(o: {
  ex: Explorer
  touched: Record<string, number>
  /** What Claude does with each file this turn. */
  activity: Record<string, Activity>
  now: number
  room: number
  width: number
  colors: Palette
  base: Base | null
  disk: readonly string[] | null
}): ExplorerProps {
  const { ex, now, room, base, colors: C, touched: t, width: inner } = o
  const act = o.activity
  // A folder shows the strongest activity under it: an edit over a read.
  const activityOf = (e: Entry): Activity | null => {
    if (e.kind !== 'dir') return act[e.path] ?? null
    const under = Object.entries(act).filter(([p]) => p.startsWith(`${e.path}/`))
    return under.some(([, k]) => k === 'edit') ? 'edit' : under.length ? 'read' : null
  }
  const rows = visibleEntries(ex)
  const rootName = baseName(ex.root) || '/'
  const crumbs = ex.onlyTouched ? [rootName, '✎ touched'] : [rootName, ...(ex.dir ? ex.dir.split('/') : [])]
  // Inside a repository, touched means what git reports changed now; outside git, the files Claude edited.
  const repo = ex.repo ?? null
  const touchedN = repo ? repo.changedFiles.length : Object.keys(t).length
  const isTouched = (e: Entry) => (repo ? Boolean(e.git && e.git !== '•') : (t[e.path] ?? 0) > 0)
  let props: ExplorerProps

  if (ex.preview) {
    const p = ex.preview
    const isEdit = p.mode === 'edit'
    const noteText = ex.error ?? p.status ?? p.note ?? (p.readOnly ? `read-only: ${p.readOnly}` : null)
    const codeRoom = noteText ? room - 1 : room
    const end = Math.min(p.lines.length, p.top + codeRoom)
    const hints: Hint[] = isEdit
      ? [
          { key: 'ctrl+s', label: 'save' },
          { key: 'ctrl+e', label: 'view' },
          { key: 'ctrl+z', label: 'undo' },
        ]
      : p.kind === 'image'
        ? [{ key: '@', label: 'mention' }, { key: '⌫', label: 'back' }, HELP]
        : [
            ...(p.readOnly ? [] : [{ key: 'e', label: 'edit' }]),
            { key: 'd', label: 'diff' },
            ...(p.kind === 'markdown' ? [{ key: 'm', label: p.mdView === 'source' ? 'rendered' : 'source' }] : []),
            { key: '@', label: p.sel ? `mention ${selRange(p.sel)[0] + 1}–${selRange(p.sel)[1] + 1}` : 'mention' },
            { key: '⌫', label: 'back' },
            HELP,
          ]
    const isRendered = !isEdit && p.kind === 'markdown' && p.mdView !== 'source'
    // Rendered markdown is laid out here, row by row: it scrolls by rows, and `top` counts rows.
    const mdRows = isRendered ? renderMarkdown(p.lines, inner) : null
    const md = mdRows ? mdRows.slice(p.top, p.top + codeRoom) : null
    // The git gutter: every line's layer and change, for the lines in view.
    const diff = base ? lineMarks({ head: base.head, index: base.index, disk: o.disk ?? p.lines, buffer: p.lines }) : null
    const gutter = diff ? diff.marks.slice(p.top, end).map(gutterMark) : null
    const changes = diff ? { ...diff.summary, repo: base?.repo ?? false } : null
    let edit: ExplorerProps['edit'] = null
    if (isEdit) {
      const gutterW = Math.max(3, String(end).length)
      const textW = Math.max(4, inner - gutterW - 4)
      const line = p.lines[p.row] ?? ''
      const cursorVis = visualCol(line, p.col)
      const hoff = cursorVis >= textW - 1 ? cursorVis - textW + 2 : 0
      edit = {
        lines: p.lines.slice(p.top, end).map(displayOf),
        startLine: p.top + 1,
        cursorRow: p.row - p.top,
        cursorVis,
        hoff,
        gutterW,
        textW,
      }
    }
    props = {
      mode: 'preview',
      crumbs: [rootName, ...p.path.split('/')],
      counter: isEdit
        ? `Ln ${p.row + 1}, Col ${p.col + 1}`
        : mdRows && md
          ? mdRows.length > codeRoom
            ? `${(md[0]?.src ?? 0) + 1}–${(md[md.length - 1]?.src ?? 0) + 1} / ${p.lines.length}`
            : `${p.lines.length} lines`
          : p.lines.length > codeRoom
            ? `${p.top + 1}–${end} / ${p.lines.length}`
            : `${p.lines.length} lines`,
      filter: null,
      hints,
      rows: [],
      top: 0,
      room,
      width: inner,
      markdown: md,
      code:
        !isEdit && !isRendered && p.kind !== 'image' && end > p.top
          ? {
              source: p.lines
                .slice(p.top, end)
                .map(l => clipEnd(l, MAX_DRAWN) || ' ')
                .join('\n'),
              path: p.path,
              startLine: p.top + 1,
            }
          : null,
      note: noteText,
      empty: null,
      colors: C,
      fileMode: isEdit ? 'edit' : p.readOnly ? 'readonly' : 'view',
      readOnly: p.readOnly,
      isDirty: p.dirty,
      label: null,
      labelHint: null,
      dirtyMark: null,
      gutter: isRendered ? null : gutter,
      changes,
      edit,
      diff: null,
      selection: p.sel && !isEdit ? [selRange(p.sel)[0] + 1, selRange(p.sel)[1] + 1] : null,
    }
    // A picture's size sits bottom right, like a file's line count; the note line is kept for problems.
    // The diff view (d) draws its rows in the code's place.
    if (p.diff) {
      const rows = p.diff.rows
      const dEnd = Math.min(rows.length, p.top + codeRoom)
      props = {
        ...props,
        crumbs: [rootName, ...p.path.split('/').slice(0, -1), `${baseName(p.path)} · diff`],
        counter: `${p.top + 1}–${dEnd} / ${rows.length}`,
        hints: [{ key: 'd', label: 'back to file' }, { key: '@', label: 'mention' }, HELP],
        code: null,
        markdown: null,
        gutter: null,
        diff: rows.slice(p.top, dEnd),
      }
    }
    if (p.kind === 'image') {
      props = {
        ...props,
        counter: p.image ? `${p.image.width}×${p.image.height} px` : '',
        fileMode: null,
        readOnly: null,
        note: ex.error ?? p.status ?? p.note,
      }
    }
  } else {
    const cursor = Math.min(ex.cursor, Math.max(0, rows.length - 1))
    const top = windowTop(cursor, rows.length, room)
    const hints: Hint[] = ex.isFiltering
      ? [
          { key: 'type', label: 'to filter' },
          { key: '⏎', label: 'done' },
          { key: '⌫', label: 'erase' },
        ]
      : [
          { key: '⏎', label: 'open' },
          { key: 'f', label: 'find' },
          { key: '/', label: 'filter' },
          { key: 't', label: touchedN ? `touched (${touchedN})` : 'touched' },
          HELP,
        ]
    props = {
      mode: 'list',
      crumbs,
      counter: ex.error && rows.length ? `⚠ ${clipEnd(ex.error, 30)}` : rows.length ? `${cursor + 1}/${rows.length}` : '',
      filter: ex.isFiltering || ex.filter ? `${ex.filter}${ex.isFiltering ? '▏' : ''}` : null,
      hints,
      rows: rows.slice(top, top + room).map((r, i) => ({
        icon: r.kind === 'dir' ? '▸' : '·',
        label: r.kind === 'dir' ? `${r.name}/` : r.name,
        meta: ex.onlyTouched && !repo ? `${t[r.path] ?? 0} edits` : r.kind === 'dir' ? '' : `${fmtSize(r.size)} · ${fmtAge(now - r.mtimeMs)}`,
        isDir: r.kind === 'dir',
        isTouched: isTouched(r),
        activity: activityOf(r),
        isSelected: top + i === cursor,
        git: r.git === '•' ? { letter: '•', tone: 'modified' as const } : r.git ? statusLetter(r.git) : null,
      })),
      top,
      room,
      width: inner,
      code: null,
      note: null,
      fileMode: null,
      readOnly: null,
      isDirty: false,
      label: null,
      labelHint: null,
      dirtyMark: null,
      gutter: null,
      changes: null,
      markdown: null,
      edit: null,
      diff: null,
      selection: null,
      empty:
        rows.length > 0
          ? null
          : (ex.error ??
            (ex.onlyTouched
              ? repo
                ? 'Nothing changed: the files match the last commit.'
                : 'No files touched yet this session.'
              : ex.filter
                ? 'Nothing matches the filter.'
                : 'Empty folder.')),
      colors: C,
    }
  }

  // Fit the header to the width: the label stays, the extras give way, the path folds.
  const header = fitHeader({ width: inner, crumbs: props.crumbs, filter: props.filter, mode: props.fileMode, isDirty: props.isDirty })
  props = { ...props, crumbs: header.crumbs, label: header.label, labelHint: header.hint, dirtyMark: header.dirty }
  return props
}

/** What a body other than the files draws in none of the files' places. */
const BLANK: Pick<
  ExplorerProps,
  | 'mode'
  | 'filter'
  | 'rows'
  | 'top'
  | 'code'
  | 'note'
  | 'empty'
  | 'fileMode'
  | 'readOnly'
  | 'isDirty'
  | 'label'
  | 'labelHint'
  | 'dirtyMark'
  | 'gutter'
  | 'changes'
  | 'markdown'
  | 'edit'
  | 'selection'
  | 'diff'
> = {
  mode: 'list',
  filter: null,
  rows: [],
  top: 0,
  code: null,
  note: null,
  empty: null,
  fileMode: null,
  readOnly: null,
  isDirty: false,
  label: null,
  labelHint: null,
  dirtyMark: null,
  gutter: null,
  changes: null,
  markdown: null,
  edit: null,
  selection: null,
  diff: null,
}

/** A window of `room` lines from `top`, and the counter beside it when the lines run past the room. */
function windowOf<T>(lines: T[], top: number, room: number): { lines: T[]; top: number; counter: string } {
  const at = clamp(top, 0, Math.max(0, lines.length - room))
  const end = Math.min(lines.length, at + room)
  return { lines: lines.slice(at, end), top: at, counter: lines.length > room ? `${at + 1}–${end} / ${lines.length}` : '' }
}

/**
 * The body's props: the tab bar over the files, the agents tab, the finder or the help, whichever shows.
 * `view` is the tab and the help; `agents` every agent, running and finished.
 */
export function bodyProps(o: Parameters<typeof explorerProps>[0] & { view: View; agents: Agent[] }): ExplorerProps {
  const { ex, view, room } = o
  const running = o.agents.filter(a => a.endedAt === null).length
  const finished = o.agents.length - running
  const r = ex.repo ?? null
  const shared = {
    body: 'files' as const,
    tab: view.tab,
    running,
    now: o.now,
    repo: r ? { name: r.name, branch: r.branch, ahead: r.ahead, behind: r.behind, changed: r.changed, staged: r.staged } : null,
  }
  const files: ExplorerProps = { ...explorerProps(o), ...shared }

  if (view.help) {
    const ctx = view.tab === 'agents' ? 'agents' : ex.preview?.diff ? 'diff' : ex.preview ? 'file' : 'list'
    const w = windowOf(helpLines(ctx), view.helpTop, room)
    return {
      ...files,
      ...BLANK,
      body: 'help',
      crumbs: ['help'],
      counter: w.counter,
      hints: [
        { key: '↑↓', label: 'scroll' },
        { key: 'any key', label: 'close' },
      ],
      help: w.lines,
    }
  }
  if (view.tab === 'agents') {
    const w = windowOf(agentLines(o.agents), view.agentsTop, room)
    return {
      ...files,
      ...BLANK,
      body: 'agents',
      crumbs: ['agents'],
      counter: w.counter || `${running} running · ${finished} finished`,
      hints: [...(finished ? [{ key: 'c', label: 'clear finished' }] : []), { key: 'Tab', label: 'files' }, HELP],
      agents: w.lines,
    }
  }
  if (ex.finder) {
    const f = ex.finder
    const found = findFiles(f.files, f.query)
    const cursor = clamp(f.cursor, 0, Math.max(0, found.length - 1))
    const top = windowTop(cursor, found.length, room)
    const isListing = f.isLoading && f.files.length === 0
    return {
      ...files,
      ...BLANK,
      body: 'finder',
      crumbs: ['find'],
      filter: `${f.query}▏`,
      counter: isListing ? '' : `${found.length ? cursor + 1 : 0}/${found.length}${found.length === MAX_RESULTS ? '+' : ''}`,
      top,
      empty: isListing ? 'Listing the files…' : found.length ? null : 'No file matches.',
      hints: [
        { key: 'type', label: 'to search' },
        { key: '⏎', label: 'open' },
        { key: '⌫', label: 'close' },
      ],
      found: found.slice(top, top + room).map((m, i) => ({ path: m.path, hits: m.hits, isSelected: top + i === cursor })),
    }
  }
  return files
}
