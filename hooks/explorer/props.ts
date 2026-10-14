// Pure logic for STRACKZDEVHUB: the props the explorer client draws, from the stored state. No `$` here, so it is testable.
import type { Entry, Explorer } from '../../types'
import { displayOf, visualCol } from './editor/editor'
import type { ExplorerProps, GutterMark, Hint, Palette } from './client'
import { MAX_DRAWN, visibleEntries, windowTop } from './model'
import { clipEnd, fmtAge, fmtSize } from '../shared/format'
import type { Base } from './git/git'
import type { LineMark } from './git/gitdiff'
import { lineMarks, statusLetter } from './git/gitdiff'
import { fitHeader } from './header'
import { markdownWindow } from './media/media'
import { baseName } from '../shared/paths'

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
  now: number
  room: number
  width: number
  colors: Palette
  base: Base | null
  disk: readonly string[] | null
}): ExplorerProps {
  const { ex, now, room, base, colors: C, touched: t, width: inner } = o
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
          { key: 'click', label: 'place cursor' },
        ]
      : p.kind === 'image'
        ? [
            { key: '@', label: 'mention' },
            { key: '⌫', label: 'back' },
          ]
        : [
            ...(p.readOnly ? [] : [{ key: 'e', label: 'edit' }]),
            ...(p.kind === 'markdown' ? [{ key: 'm', label: p.mdView === 'source' ? 'rendered' : 'source' }] : []),
            { key: '↑↓', label: 'scroll' },
            { key: 'PgUp/Dn', label: 'page' },
            { key: 'g/G', label: 'top/end' },
            { key: '@', label: 'mention' },
            { key: '⌫', label: 'back' },
          ]
    const isRendered = !isEdit && p.kind === 'markdown' && p.mdView !== 'source'
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
      counter: isEdit ? `Ln ${p.row + 1}, Col ${p.col + 1}` : p.lines.length > codeRoom ? `${p.top + 1}–${end} / ${p.lines.length}` : `${p.lines.length} lines`,
      filter: null,
      hints,
      rows: [],
      top: 0,
      room,
      width: inner,
      markdown: isRendered ? markdownWindow(p.lines, p.top, codeRoom) : null,
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
    }
    // A picture's size sits bottom right, like a file's line count; the note line is kept for problems.
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
          { key: 'e', label: 'edit' },
          { key: '⌫', label: 'back' },
          { key: '/', label: 'filter' },
          { key: '.', label: ex.showHidden ? 'hide dotfiles' : 'dotfiles' },
          { key: 't', label: touchedN ? `touched (${touchedN})` : 'touched' },
          { key: '@', label: 'mention' },
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
