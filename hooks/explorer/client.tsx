// The explorer's surface module: draws what the hooks module hands it and posts keys and clicks back.
// It holds no explorer state of its own; a click inside gives it the keyboard, Esc hands it back.
import type { ClientModule } from 'claude-code'
import type { DiffRow } from '../../types'
import type { AgentLine } from '../agents/view'
import type { HelpLine } from '../help'
import { agentsBody, finderBody, framed, helpBody, tabAt, tabStrip } from './views'

export type GitLetter = { letter: string; tone: 'staged' | 'modified' | 'untracked' | 'deleted' | 'conflict' }

export type Row = {
  icon: string
  label: string
  meta: string
  isDir: boolean
  isTouched: boolean
  isSelected: boolean
  /** What Claude is doing with the file (or something under the folder) this turn. */
  activity: 'read' | 'edit' | null
  /** The file's git status letter, or a dot on a folder holding changes. */
  git: GitLetter | null
}
/** One gutter cell beside a line: a bar coloured by what changed it, a low bar where lines were deleted. */
export type GutterMark = { glyph: string; tone: 'unsaved' | 'added' | 'modified' | 'deleted' | 'staged' }

export type Changes = { unsaved: number; added: number; modified: number; deleted: number; staged: number; repo: boolean }

export type Palette = {
  accent: string
  dir: string
  touched: string
  dim: string
  text: string
  selectedBg: string
  hoverBg: string
  warn: string
  pillFg: string
  ok: string
  bad: string
  purple: string
  info: string
}

export type Hint = { key: string; label: string }

/** What the explorer posts back to the hooks module: every message carries the rows it shows. */
export type UiMessage =
  | { k: 'key'; key: string; ctrl: boolean; meta: boolean; room: number }
  | { k: 'mode' | 'crumb'; room: number }
  | { k: 'place'; row: number; vis: number; room: number }
  | { k: 'click'; index: number; room: number }
  | { k: 'line'; row: number; isExtend: boolean; room: number }
  | { k: 'tab'; tab: 'files' | 'agents'; room: number }
  | { k: 'pick'; index: number; room: number }

export type ExplorerProps = {
  mode: 'list' | 'preview'
  crumbs: string[]
  counter: string
  filter: string | null
  hints: Hint[]
  rows: Row[]
  top: number
  room: number
  width: number
  code: { source: string; path: string; startLine: number } | null
  note: string | null
  empty: string | null
  colors: Palette
  /** The open file's mode, drawn as the label at the top right; null in the list. */
  fileMode: 'view' | 'edit' | 'readonly' | null
  /** Why the open file cannot be edited: drawn beside the READ ONLY label. */
  readOnly: string | null
  isDirty: boolean
  /** The header as fitted to the width by the hooks module: the mode label, the shortcut beside it, the unsaved mark. */
  label: string | null
  labelHint: Hint | null
  dirtyMark: string | null
  /** The git gutter for the lines in view (null: no data yet), and the file's change counts. */
  gutter: Array<GutterMark | null> | null
  changes: Changes | null
  /** Rendered markdown for the lines in view, when a markdown file shows rendered. */
  markdown: string | null
  /** The editor's window: display lines (tabs expanded), the cursor in it, the gutter and text widths. */
  edit: EditView | null
  /** The picked lines, first and last, 1-based; null when none. */
  selection: [number, number] | null
  /** The diff view's rows in view: hunk headers, shared lines, removed and added lines. */
  diff: DiffRow[] | null
  /** The tab bar: which tab shows, how many agents run, and the project bar at its right (in a repository). */
  tab?: 'files' | 'agents'
  running?: number
  repo?: RepoBar | null
  /** What the body draws: the files (list or file), the agents tab, the finder, or the help. */
  body?: 'files' | 'agents' | 'finder' | 'help'
  /** The box's frame colour: it says which tab or mode shows. */
  frame?: string
  /** The clock when drawn: running agents' timers tick on from it. */
  now?: number
  agents?: AgentLine[] | null
  help?: HelpLine[] | null
  found?: FoundRow[] | null
}

export type RepoBar = { name: string; branch: string; ahead: number; behind: number; changed: number; staged: number }
/** One finder result: its path, the matched letters' places in it, and whether it is picked. */
export type FoundRow = { path: string; hits: number[]; isSelected: boolean }

export type EditView = {
  lines: string[]
  startLine: number
  cursorRow: number
  cursorVis: number
  hoff: number
  gutterW: number
  textW: number
}

/** The props as last drawn, the line a drag last reached (so a drag posts once per line), and the seconds ticked since `now`. */
type Ref = { props: ExplorerProps; dragRow?: number | null; ticks: number; lastNow: number }
type State = { ref: Ref }

/** Rows above the list, inside the box: the breadcrumb and a rule. */
const HEAD = 2
/** Where the box's inside starts in the region: the two rows of the tab strip and the top border down, the border and padding across. */
const TOP = 3
/** While agents run, the client ticks this often: the agents tab's spinner turns and their timers count. */
const TICK_MS = 200
const LEFT = 2

const FALLBACK: Palette = {
  accent: 'claude',
  dir: 'suggestion',
  touched: 'warning',
  dim: 'inactive',
  text: 'text',
  selectedBg: 'subtle',
  hoverBg: 'subtle',
  warn: 'warning',
  pillFg: 'inverseText',
  ok: 'success',
  bad: 'error',
  purple: 'permission',
  info: 'suggestion',
}

/** Props as they may arrive: from an older load of the hooks module, or partial. Never throws. */
function complete(raw: Partial<ExplorerProps> | null | undefined): ExplorerProps {
  const p = raw ?? {}
  const arr = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : [])
  return {
    mode: p.mode === 'preview' ? 'preview' : 'list',
    crumbs: arr(p.crumbs),
    counter: typeof p.counter === 'string' ? p.counter : '',
    filter: typeof p.filter === 'string' ? p.filter : null,
    hints: arr(p.hints),
    rows: arr(p.rows).map(r => ({ ...r, git: r.git ?? null })),
    top: typeof p.top === 'number' ? p.top : 0,
    room: typeof p.room === 'number' ? p.room : 10,
    width: typeof p.width === 'number' ? p.width : 60,
    code: p.code && typeof p.code.source === 'string' ? p.code : null,
    note: typeof p.note === 'string' ? p.note : null,
    empty: typeof p.empty === 'string' ? p.empty : null,
    colors: { ...FALLBACK, ...(p.colors ?? {}) },
    fileMode: p.fileMode === 'view' || p.fileMode === 'edit' || p.fileMode === 'readonly' ? p.fileMode : null,
    readOnly: typeof p.readOnly === 'string' ? p.readOnly : null,
    isDirty: p.isDirty === true,
    label: typeof p.label === 'string' ? p.label : null,
    labelHint: p.labelHint && typeof p.labelHint.key === 'string' ? p.labelHint : null,
    dirtyMark: typeof p.dirtyMark === 'string' ? p.dirtyMark : null,
    gutter: Array.isArray(p.gutter) ? p.gutter : null,
    changes: p.changes && typeof p.changes.added === 'number' ? p.changes : null,
    markdown: typeof p.markdown === 'string' ? p.markdown : null,
    edit: p.edit && Array.isArray(p.edit.lines) ? p.edit : null,
    diff: Array.isArray(p.diff) ? p.diff : null,
    selection: Array.isArray(p.selection) && p.selection.length === 2 ? p.selection : null,
    tab: p.tab === 'agents' ? 'agents' : 'files',
    running: typeof p.running === 'number' ? p.running : 0,
    repo: p.repo && typeof p.repo.name === 'string' ? p.repo : null,
    body: p.body === 'agents' || p.body === 'finder' || p.body === 'help' ? p.body : 'files',
    now: typeof p.now === 'number' ? p.now : 0,
    frame: typeof p.frame === 'string' ? p.frame : undefined,
    agents: Array.isArray(p.agents) ? p.agents : null,
    help: Array.isArray(p.help) ? p.help : null,
    found: Array.isArray(p.found) ? p.found : null,
  }
}

const Explorer: ClientModule<ExplorerProps, State> = (rawProps, surface) => {
  const { Box, Text, Code, Markdown } = surface.elements
  const props = complete(rawProps)
  const ref = surface.state?.ref ?? { props, ticks: 0, lastNow: -1 }
  ref.props = props
  if (props.now !== ref.lastNow) {
    ref.lastNow = props.now ?? 0
    ref.ticks = 0
  }

  if (surface.state === undefined) {
    surface.setState({ ref })
    const post = (m: UiMessage) => surface.post(m)
    // While agents run, the client ticks: the agents tab's spinner turns and their timers count, with no redraw of the pane.
    surface.every(TICK_MS, () => {
      if (!ref.props.running) return
      ref.ticks += 1
      surface.setState({ ref })
    })
    surface.onKey(k => {
      post({ k: 'key', key: k.key, ctrl: k.ctrl ?? false, meta: k.meta ?? false, room: ref.props.room })
    })
    surface.onPointer(raw => {
      const cur = ref.props
      // The tab strip: a click on a tab shows it.
      if (raw.y < TOP - 1) {
        const tab = raw.type === 'down' && raw.button === 'left' ? tabAt(raw.x, Math.max(20, cur.width) + 2 * LEFT, cur.running ?? 0) : null
        if (tab) post({ k: 'tab', tab, room: cur.room })
        return
      }
      // From here on, places inside the box.
      const p = { ...raw, x: raw.x - LEFT, y: raw.y - TOP }
      if (cur.body === 'finder') {
        const i = p.y - HEAD
        if (p.type === 'down' && p.button === 'left' && i >= 0 && i < (cur.found ?? []).length) post({ k: 'pick', index: cur.top + i, room: cur.room })
        else if (p.type === 'down' && p.button === 'left' && p.y === 0) post({ k: 'crumb', room: cur.room })
        return
      }
      if (cur.body !== 'files') {
        if (p.type === 'down' && p.button === 'left' && p.y === 0) post({ k: 'crumb', room: cur.room })
        return
      }
      // In the file view, a press picks a line and a drag (or shift+click) stretches the pick.
      const codeRow = p.y - HEAD - (cur.note ? 1 : 0)
      const isOnCode = cur.code !== null && !cur.edit && codeRow >= 0 && codeRow < cur.code.source.split('\n').length
      if (p.type === 'move' && p.button === 'left') {
        if (isOnCode && codeRow !== ref.dragRow) {
          ref.dragRow = codeRow
          post({ k: 'line', row: codeRow, isExtend: true, room: cur.room })
        }
        return
      }
      if (p.type !== 'down' || p.button !== 'left') return
      ref.dragRow = null
      // The mode label toggles view and edit; the rest of the breadcrumb goes back.
      const label = cur.label ?? ''
      if (p.y === 0 && label && p.x >= Math.max(10, cur.width) - label.length) return post({ k: 'mode', room: cur.room })
      if (p.y === 0) return post({ k: 'crumb', room: cur.room })
      if (cur.edit) {
        const row = p.y - HEAD - (cur.note ? 1 : 0)
        if (row < 0 || row >= cur.edit.lines.length) return
        const vis = p.x - cur.edit.gutterW - 4 + (row === cur.edit.cursorRow ? cur.edit.hoff : 0)
        return post({ k: 'place', row, vis, room: cur.room })
      }
      if (isOnCode) {
        ref.dragRow = codeRow
        return post({ k: 'line', row: codeRow, isExtend: p.shift === true, room: cur.room })
      }
      const i = p.y - HEAD
      if (cur.mode === 'list' && i >= 0 && i < cur.rows.length) post({ k: 'click', index: cur.top + i, room: cur.room })
    })
  }

  const c = props.colors
  const markColor = (t: GutterMark['tone']) =>
    t === 'unsaved' ? c.warn : t === 'added' ? c.ok : t === 'modified' ? c.accent : t === 'deleted' ? c.bad : c.purple
  const letterColor = (t: GitLetter['tone']) => (t === 'staged' || t === 'untracked' ? c.ok : t === 'modified' ? c.warn : c.bad)
  const markAt = (i: number) => {
    const m = props.gutter?.[i]
    return m ? <Text color={markColor(m.tone)}>{m.glyph}</Text> : <Text> </Text>
  }
  /** A changed line's number takes its change's colour, bold; the rest stay dim. */
  const numberColor = (i: number) => {
    const m = props.gutter?.[i]
    return m && m.tone !== 'deleted' ? markColor(m.tone) : undefined
  }
  const W = Math.max(20, props.width)
  const metaW = props.mode === 'list' ? Math.min(20, Math.max(0, W - 24)) : 0
  const nameW = Math.max(6, W - metaW - 6)

  const ch = props.changes
  const pillBg = props.fileMode === 'edit' ? c.warn : props.fileMode === 'view' ? c.accent : c.dim
  const crumbs = (
    <Box flexDirection="row" justifyContent="space-between" width={W}>
      <Box flexShrink={1}>
        <Text wrap="truncate-end">
          {props.crumbs.map((part, i) => (
            <Text>
              {i > 0 ? <Text color={c.dim}> › </Text> : null}
              <Text color={i === props.crumbs.length - 1 ? c.accent : c.dim} bold={i === props.crumbs.length - 1}>
                {part}
              </Text>
            </Text>
          ))}
          {props.filter !== null ? <Text color={c.warn}>{`  ⌕ ${props.filter}`}</Text> : null}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text>
          {props.dirtyMark ? <Text color={c.warn}>{`${props.dirtyMark}  `}</Text> : null}
          {props.labelHint ? (
            <Text>
              <Text color={c.accent} bold>
                {props.labelHint.key}
              </Text>
              <Text color={c.dim}>{` ${props.labelHint.label}  `}</Text>
            </Text>
          ) : null}
          {props.label ? (
            <Text backgroundColor={pillBg} color={c.pillFg} bold>
              {props.label}
            </Text>
          ) : null}
        </Text>
      </Box>
    </Box>
  )

  const list = (
    <Box flexDirection="column" height={props.room}>
      {props.empty ? (
        <Text color={c.dim} italic wrap="truncate-end">
          {`  ${props.empty}`}
        </Text>
      ) : null}
      {props.rows.map((r, i) => {
        const bg = r.isSelected ? c.selectedBg : undefined
        // What Claude does this turn comes first (yellow while it edits, purple while it reads); then, as in
        // VS Code, a changed file's name takes its git colour.
        const actColor = r.activity === 'edit' ? c.touched : r.activity === 'read' ? c.purple : null
        const nameColor = actColor ?? (r.git && r.git.letter !== '•' ? letterColor(r.git.tone) : r.isDir ? c.dir : r.isTouched ? c.touched : c.text)
        const icon = r.activity === 'edit' ? '✎' : r.activity === 'read' ? '◉' : r.isTouched ? '✎' : r.icon
        return (
          <Box key={`row${i}`} flexDirection="row" width={W}>
            <Text backgroundColor={bg} color={r.isSelected ? c.accent : c.dim} hover={{ backgroundColor: c.hoverBg }}>
              {r.isSelected ? '▌' : ' '}
            </Text>
            <Text
              backgroundColor={bg}
              color={actColor ?? (r.isTouched ? c.touched : r.isDir ? c.dir : c.dim)}
              bold={actColor !== null}
              hover={{ backgroundColor: c.hoverBg }}
            >
              {`${icon} `}
            </Text>
            <Text backgroundColor={bg} color={r.git ? letterColor(r.git.tone) : c.dim} bold hover={{ backgroundColor: c.hoverBg }}>
              {`${r.git?.letter ?? ' '} `}
            </Text>
            <Box width={nameW}>
              <Text
                backgroundColor={bg}
                color={nameColor}
                bold={r.isSelected || r.isDir || actColor !== null}
                wrap="truncate-end"
                hover={{ backgroundColor: c.hoverBg }}
              >
                {r.label.padEnd(nameW)}
              </Text>
            </Box>
            {metaW > 0 ? (
              <Box width={metaW} justifyContent="flex-end">
                <Text backgroundColor={bg} color={c.dim} wrap="truncate-start" hover={{ backgroundColor: c.hoverBg }}>
                  {r.meta.padStart(metaW)}
                </Text>
              </Box>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )

  const ev = props.edit
  const editor = ev ? (
    <Box flexDirection="column">
      {ev.lines.map((line, i) => {
        const gutter = `${String(ev.startLine + i).padStart(ev.gutterW)} │ `
        if (i !== ev.cursorRow) {
          return (
            <Text wrap="truncate-end">
              {markAt(i)}
              <Text color={numberColor(i) ?? c.dim} bold={numberColor(i) !== undefined}>
                {gutter}
              </Text>
              <Text color={c.text}>{line.slice(0, ev.textW)}</Text>
            </Text>
          )
        }
        const shown = line.slice(ev.hoff)
        const at = ev.cursorVis - ev.hoff
        const before = shown.slice(0, at)
        const under = shown[at] ?? ' '
        const after = shown.slice(at + 1, Math.max(at + 1, ev.textW))
        return (
          <Text wrap="truncate-end">
            {markAt(i)}
            <Text color={numberColor(i) ?? c.warn} bold>
              {gutter}
            </Text>
            <Text backgroundColor={c.selectedBg} color={c.text}>
              {before}
            </Text>
            <Text inverse color={c.warn}>
              {under}
            </Text>
            <Text backgroundColor={c.selectedBg} color={c.text}>
              {after.padEnd(Math.max(0, ev.textW - before.length - 1))}
            </Text>
          </Text>
        )
      })}
    </Box>
  ) : null

  const isPicked = (line: number) => props.selection !== null && line >= props.selection[0] && line <= props.selection[1]

  // The diff view: the new line's number (the old one's on a removed line), a +/- mark, the text.
  const diffNumW = Math.max(3, ...(props.diff ?? []).map(r => String(r.new ?? r.old ?? '').length))
  const diffView = props.diff ? (
    <Box flexDirection="column">
      {props.diff.map(r =>
        r.kind === 'hunk' ? (
          <Text color={c.accent} dimColor wrap="truncate-end">
            {r.text}
          </Text>
        ) : (
          <Text wrap="truncate-end">
            <Text color={c.dim}>{`${String(r.new ?? r.old ?? '').padStart(diffNumW)} `}</Text>
            <Text color={r.kind === 'add' ? c.ok : r.kind === 'del' ? c.bad : c.dim} bold>
              {r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}
            </Text>
            <Text color={r.kind === 'add' ? c.ok : r.kind === 'del' ? c.bad : c.text}>{` ${r.text || ' '}`}</Text>
          </Text>
        ),
      )}
    </Box>
  ) : null

  const numW = Math.max(3, String((props.code?.startLine ?? 1) + Math.max(0, (props.code?.source.split('\n').length ?? 1) - 1)).length)
  const preview = (
    <Box flexDirection="column" height={props.room}>
      {props.note ? (
        <Text color={c.warn} wrap="truncate-end">
          {`⚠ ${props.note}`}
        </Text>
      ) : null}
      {editor}
      {diffView}
      {props.markdown !== null ? (
        <Box flexDirection="column" width={W} height={Math.max(1, props.room - (props.note ? 1 : 0))} overflow="hidden">
          <Markdown text={props.markdown || ' '} />
        </Box>
      ) : null}
      {props.code && props.code.source ? (
        <Box flexDirection="row" width={W}>
          <Box flexDirection="column" width={numW + 3} flexShrink={0}>
            {props.code.source.split('\n').map((_, i) => (
              <Text>
                {markAt(i)}
                <Text
                  color={isPicked((props.code?.startLine ?? 1) + i) ? c.accent : (numberColor(i) ?? c.dim)}
                  backgroundColor={isPicked((props.code?.startLine ?? 1) + i) ? c.selectedBg : undefined}
                  bold={isPicked((props.code?.startLine ?? 1) + i) || numberColor(i) !== undefined}
                >
                  {String((props.code?.startLine ?? 1) + i).padStart(numW)}
                </Text>
                <Text color={isPicked((props.code?.startLine ?? 1) + i) ? c.accent : c.dim}>{isPicked((props.code?.startLine ?? 1) + i) ? ' ┃' : ' │'}</Text>
              </Text>
            ))}
          </Box>
          <Box flexDirection="column" width={Math.max(1, W - numW - 4)} marginLeft={1}>
            <Code source={props.code.source} path={props.code.path} wrap="truncate-end" />
          </Box>
        </Box>
      ) : null}
    </Box>
  )

  return (
    <Box flexDirection="column" width={W + 2 * LEFT}>
      {tabStrip(surface.elements, props, W + 2 * LEFT, ref.ticks)}
      {framed(
        surface.elements,
        props,
        W + 2 * LEFT,
        props.room + HEAD + 1,
        <Box flexDirection="column" width={W}>
          {crumbs}
          <Text color={c.dim}>{'─'.repeat(W)}</Text>
          {props.body === 'agents'
            ? agentsBody(surface.elements, props, W, ref.ticks * TICK_MS)
            : props.body === 'help'
              ? helpBody(surface.elements, props)
              : props.body === 'finder'
                ? finderBody(surface.elements, props, W)
                : props.mode === 'list'
                  ? list
                  : preview}
          <Box flexDirection="row" justifyContent="space-between" width={W}>
            <Box flexShrink={1}>
              <Text wrap="truncate-end">
                {props.hints.map((hint, i) => (
                  <Text>
                    {i > 0 ? <Text color={c.dim}>{'  '}</Text> : null}
                    <Text color={c.accent} bold>
                      {hint.key}
                    </Text>
                    <Text color={c.dim}>{` ${hint.label}`}</Text>
                  </Text>
                ))}
              </Text>
            </Box>
            {props.counter || ch ? (
              <Box flexShrink={0} marginLeft={2}>
                <Text>
                  {ch && ch.unsaved ? <Text color={c.warn}>{`● ${ch.unsaved} unsaved  `}</Text> : null}
                  {ch && ch.added ? <Text color={c.ok}>{`+${ch.added} `}</Text> : null}
                  {ch && ch.modified ? <Text color={c.accent}>{`~${ch.modified} `}</Text> : null}
                  {ch && ch.deleted ? <Text color={c.bad}>{`−${ch.deleted} `}</Text> : null}
                  {ch && ch.staged ? <Text color={c.purple}>{`✓${ch.staged} staged `}</Text> : null}
                  {ch && !ch.repo && (ch.added || ch.modified || ch.deleted) ? <Text color={c.dim}>{'since opened '}</Text> : null}
                  {ch && (ch.unsaved || ch.added || ch.modified || ch.deleted || ch.staged) ? <Text color={c.dim}> </Text> : null}
                  <Text color={c.dim}>{props.counter}</Text>
                </Text>
              </Box>
            ) : null}
          </Box>
        </Box>,
      )}
    </Box>
  )
}

export default Explorer
