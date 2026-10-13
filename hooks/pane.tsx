// The pane's drawing: three boxes from the stored state, the explorer drawn by its client module.
import type { On } from 'claude-code'
import { displayOf, visualCol } from './editor'
import type { ExplorerProps, GutterMark, Hint, Palette } from './explorer'
import { MAX_DRAWN, visibleEntries, windowTop } from './explorer-state'
import { EFFORT_LEVEL, clipEnd, fmtAge, fmtDuration, fmtSize, fmtTokens, fmtUsd, gauge, hasLongContext, limitLabel, modeColorKey, prettyModel } from './format'
import { bases, fetchBase } from './git'
import type { LineMark } from './gitdiff'
import { lineMarks, statusLetter } from './gitdiff'
import { fitHeader } from './header'
import { fitPicture, markdownWindow } from './media'
import { baseName } from './paths'
import { PANE, getAgents, getExplorer, getTouched, getVitals, paneState, readGitTick, saved } from './state'

export type Colors = Palette & { ok: string; bad: string; info: string; purple: string; frame: string }

export const ONE_DARK: Colors = {
  accent: '#61afef',
  dir: '#61afef',
  touched: '#e5c07b',
  dim: '#5c6370',
  text: '#abb2bf',
  selectedBg: '#3e4451',
  hoverBg: '#2c313a',
  warn: '#e5c07b',
  ok: '#98c379',
  bad: '#e06c75',
  info: '#56b6c2',
  purple: '#c678dd',
  frame: '#4b5263',
  pillFg: '#282c34',
}

export const THEME: Colors = {
  accent: 'claude',
  dir: 'suggestion',
  touched: 'warning',
  dim: 'inactive',
  text: 'text',
  selectedBg: 'subtle',
  hoverBg: 'subtle',
  warn: 'warning',
  ok: 'success',
  bad: 'error',
  info: 'suggestion',
  purple: 'permission',
  frame: 'inactive',
  pillFg: 'inverseText',
}

/** Agents drawn before the rest fold into `+n more`. */
const MAX_AGENTS = 4

/** One gutter cell: a bar for an added or modified line, a low bar where lines were deleted. */
function gutterMark(m: LineMark): GutterMark | null {
  if (!m.layer) return null
  return { glyph: m.change ? '▌' : '▁', tone: m.layer === 'unsaved' ? 'unsaved' : m.layer === 'staged' ? 'staged' : m.change ?? 'deleted' }
}

/** Draws the pane: the session's vitals, the running agents, and the explorer. */
export const registerPane = (on: On, C: Colors) => {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Drawn means open: the live refresh runs from here until the pane closes.
    paneState.isOpen = true
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const hasClient = 'Client' in els
    const [v, ex, t, list, now] = await Promise.all([getVitals($), getExplorer($), getTouched($), getAgents($), $.clock.now(), readGitTick($)])
    // The pane's real width: drawing wider than it would overflow; every row below truncates instead.
    const W = Math.max(24, e.props.bodyColumns)
    const inner = W - 4 // a section's round border and its one-cell padding each side
    const bodyRows = Math.max(8, e.props.scroll.bodyRows)

    const clock = (key: string, since: number, color: string) =>
      hasClient ? (
        <els.Client key={key} module="./elapsed.tsx" props={{ since, now, color }} />
      ) : (
        <Text color={color}>{fmtDuration(now - since)}</Text>
      )

    const section = (title: string, right: unknown, body: unknown, color = C.frame) => (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} width={W}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={C.dim} bold>
            {title}
          </Text>
          {right as never}
        </Box>
        {body as never}
      </Box>
    )

    // ---- vitals
    const effortN = EFFORT_LEVEL[v.effort] ?? 0
    const pct = v.pct ?? 0
    const ctxColor = pct >= 85 ? C.bad : pct >= 70 ? C.warn : C.ok
    const gaugeW = Math.max(6, Math.min(24, inner - 36))
    const modeColor = C[modeColorKey(v.mode)]
    const isRunning = v.turnStartedAt !== null
    // A live timer is a Client, which only a Box may hold: inside a Text the engine refuses the whole pane.
    const turn = isRunning ? (
      <Box flexDirection="row" flexShrink={0}>
        <Text color={C.ok}>● </Text>
        {clock('turn-timer', v.turnStartedAt ?? now, C.ok)}
      </Box>
    ) : (
      <Text color={C.dim}>{v.lastTurnMs === null ? '○ idle' : `○ idle · last ${fmtDuration(v.lastTurnMs)}`}</Text>
    )

    const vitalsBox = section(
      'SESSION',
      turn,
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text backgroundColor={C.accent} color={C.pillFg} bold>
              {` ${prettyModel(v.model)} `}
            </Text>
            {hasLongContext(v.model) ? <Text color={C.accent}> 1M</Text> : null}
            <Text color={C.dim}>{'  effort '}</Text>
            <Text color={C.purple}>{'●'.repeat(effortN) + '○'.repeat(Math.max(0, 5 - effortN))}</Text>
            {v.effort ? <Text color={C.text}>{` ${v.effort}`}</Text> : <Text color={C.dim}> after 1st reply</Text>}
          </Text>
          <Text color={modeColor} bold>
            {v.mode}
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color={C.dim}>{'ctx  '}</Text>
            <Text color={ctxColor}>{gauge(pct, gaugeW)}</Text>
            {v.pct === null ? (
              <Text color={C.dim}> waiting for the 1st reply</Text>
            ) : (
              <Text color={C.text} bold>
                {` ${Math.round(pct)}%`}
              </Text>
            )}
            {v.tokens !== null && v.window ? <Text color={C.dim}>{`  ${fmtTokens(v.tokens)} / ${fmtTokens(v.window)}`}</Text> : null}
            {v.compactions > 0 ? <Text color={C.dim}>{`  ⟲${v.compactions}`}</Text> : null}
          </Text>
          <Text>
            <Text color={C.ok} bold>
              {v.costUsd === null ? '$—' : fmtUsd(v.costUsd)}
            </Text>
            {v.lastTurnCost !== null && v.lastTurnCost > 0.005 ? <Text color={C.dim}>{` +${fmtUsd(v.lastTurnCost)}`}</Text> : null}
          </Text>
        </Box>
        {v.limits.length > 0 ? (
          <Text wrap="truncate-end">
            <Text color={C.dim}>{'lim  '}</Text>
            {v.limits.slice(0, 3).map(l => (
              <Text>
                <Text color={C.dim}>{`${limitLabel(l.kind)} `}</Text>
                <Text color={l.pct >= 85 ? C.bad : l.pct >= 60 ? C.warn : C.ok}>{gauge(l.pct, 6)}</Text>
                <Text color={C.text}>{` ${Math.round(l.pct)}%    `}</Text>
              </Text>
            ))}
          </Text>
        ) : null}
      </Box>,
    )
    const vitalsRows = 2 + 1 + 2 + (v.limits.length > 0 ? 1 : 0)

    // ---- agents: only while some run; each leaves when it finishes
    // Agents give way before the file list drops under 3 rows.
    const spare = bodyRows - vitalsRows - 5 - 3 - 3
    const fit = Math.max(1, Math.min(MAX_AGENTS, Math.floor((spare - 1) / 2)))
    const shown = list.slice(-fit)
    const more = list.length - shown.length
    const agentsBox =
      list.length === 0
        ? null
        : section(
            `AGENTS · ${list.length} running`,
            <Text color={C.dim}>{list.some(a => a.isBackground) ? 'background' : ''}</Text>,
            <Box flexDirection="column">
              {shown.map(a => (
                <Box flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text wrap="truncate-end">
                      <Text color={C.info}>◆ </Text>
                      <Text color={C.text} bold>
                        {a.name}
                      </Text>
                      {a.type !== a.name ? <Text color={C.dim}>{` ${a.type}`}</Text> : null}
                      {a.model ? <Text color={C.purple}>{`  ${prettyModel(a.model)}`}</Text> : null}
                      <Text color={C.dim}>{`  ${a.steps} steps · ${a.tools} tools${a.ctx ? ` · ${fmtTokens(a.ctx)} ctx` : ''}`}</Text>
                    </Text>
                    <Box flexShrink={0} marginLeft={1}>
                      {clock(`agent-${a.id}`, a.startedAt, C.info)}
                    </Box>
                  </Box>
                  <Text wrap="truncate-end">
                    <Text color={C.dim}>{'  ↳ '}</Text>
                    <Text color={C.text}>{clipEnd(a.task ?? '', Math.max(10, inner - 30))}</Text>
                    {a.lastTool ? <Text color={C.dim}>{`  ⟶ ${a.lastTool}`}</Text> : null}
                  </Text>
                </Box>
              ))}
              {more > 0 ? <Text color={C.dim}>{`+${more} more`}</Text> : null}
            </Box>,
            C.info,
          )
    const agentsRows = list.length === 0 ? 0 : 2 + 1 + shown.length * 2 + (more > 0 ? 1 : 0)

    // ---- explorer: breadcrumb and rule, the rows, the hint line
    // Inside a git repository, the project bar takes one row above the files.
    const repo = ex.onlyTouched ? null : ex.repo ?? null
    const room = Math.max(3, bodyRows - vitalsRows - agentsRows - 2 - 3 - (repo ? 1 : 0))
    const rows = visibleEntries(ex)
    const rootName = baseName(ex.root) || '/'
    const crumbs = ex.onlyTouched ? [rootName, '✎ touched'] : [rootName, ...(ex.dir ? ex.dir.split('/') : [])]
    const touchedN = Object.keys(t).length
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
      const base = bases.get(p.path)
      if (!base) void fetchBase($, ex.root, p.path).catch(() => undefined)
      const diff = base ? lineMarks({ head: base.head, index: base.index, disk: saved.get(p.path) ?? p.lines, buffer: p.lines }) : null
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
        code: !isEdit && !isRendered && p.kind !== 'image' && end > p.top ? { source: p.lines.slice(p.top, end).map(l => clipEnd(l, MAX_DRAWN) || ' ').join('\n'), path: p.path, startLine: p.top + 1 } : null,
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
        props = { ...props, counter: p.image ? `${p.image.width}×${p.image.height} px` : '', fileMode: null, readOnly: null, note: ex.error ?? p.status ?? p.note }
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
          meta: ex.onlyTouched ? `${t[r.path] ?? 0} edits` : r.kind === 'dir' ? '' : `${fmtSize(r.size)} · ${fmtAge(now - r.mtimeMs)}`,
          isDir: r.kind === 'dir',
          isTouched: (t[r.path] ?? 0) > 0,
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
        empty: rows.length > 0 ? null : ex.error ?? (rows.length === 0 ? (ex.onlyTouched ? 'No files touched yet this session.' : ex.filter ? 'Nothing matches the filter.' : 'Empty folder.') : null),
        colors: C,
      }
    }

    // Fit the header to the width: the label stays, the extras give way, the path folds.
    const header = fitHeader({ width: inner, crumbs: props.crumbs, filter: props.filter, mode: props.fileMode, isDirty: props.isDirty })
    props = { ...props, crumbs: header.crumbs, label: header.label, labelHint: header.hint, dirtyMark: header.dirty }

    // A picture is the pane's to draw (the explorer client cannot): over the explorer's empty body.
    const pic = ex.preview?.kind === 'image' ? ex.preview.image ?? null : null
    const picRows = Math.max(1, room - (props.note ? 1 : 0))
    const picBox = pic ? fitPicture(pic.width, pic.height, inner, picRows) : null
    const picture =
      pic && picBox && 'Image' in els ? (
        <Box position="absolute" top={(repo ? 1 : 0) + 2 + (props.note ? 1 : 0)} left={Math.floor((inner - picBox.columns) / 2)}>
          <els.Image key="picture" source={{ file: pic.file, format: 'png' }} columns={picBox.columns} rows={picBox.rows} alt={baseName(pic.file)} />
        </Box>
      ) : null

    const filesBox = (
      <Box flexDirection="column" borderStyle="round" borderColor={ex.preview?.mode === 'edit' ? C.warn : ex.preview ? C.accent : C.frame} paddingX={1} width={W}>
        {repo ? (
          <Box flexDirection="row" justifyContent="space-between" width={inner}>
            <Box flexShrink={1}>
              <Text wrap="truncate-end">
                <Text color={C.purple} bold>
                  {'⎇ '}
                </Text>
                <Text color={C.text} bold>
                  {repo.name}
                </Text>
                <Text color={C.dim}>{'  on '}</Text>
                <Text color={C.purple}>{repo.branch}</Text>
                {repo.ahead ? <Text color={C.ok}>{` ↑${repo.ahead}`}</Text> : null}
                {repo.behind ? <Text color={C.bad}>{` ↓${repo.behind}`}</Text> : null}
              </Text>
            </Box>
            <Box flexShrink={0} marginLeft={1}>
              <Text>
                {repo.changed ? <Text color={C.warn}>{`${repo.changed} changed`}</Text> : null}
                {repo.changed && repo.staged ? <Text color={C.dim}>{' · '}</Text> : null}
                {repo.staged ? <Text color={C.ok}>{`${repo.staged} staged`}</Text> : null}
                {!repo.changed && !repo.staged ? <Text color={C.ok}>{'✓ clean'}</Text> : null}
              </Text>
            </Box>
          </Box>
        ) : null}
        {hasClient ? (
          <els.Client key="explorer" module="./explorer.tsx" props={props} width={inner} height={room + 3} />
        ) : (
          <Text color={C.dim}>The file explorer needs a surface that runs client modules (the terminal does).</Text>
        )}
        {picture}
      </Box>
    )

    return (
      <Box flexDirection="column" width={W}>
        {vitalsBox}
        {agentsBox}
        {filesBox}
      </Box>
    )
  })
}
