// The explorer's surface module: draws what the hooks module hands it and posts keys and clicks back.
// It holds no explorer state of its own; a click inside gives it the keyboard, Esc hands it back.
import type { ClientModule } from 'claude-code'

export type Row = { icon: string; label: string; meta: string; isDir: boolean; isTouched: boolean; isSelected: boolean }

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
}

export type Hint = { key: string; label: string }

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
  isDirty: boolean
  /** The editor's window: display lines (tabs expanded), the cursor in it, the gutter and text widths. */
  edit: EditView | null
}

export type EditView = {
  lines: string[]
  startLine: number
  cursorRow: number
  cursorVis: number
  hoff: number
  gutterW: number
  textW: number
}

type Ref = { props: ExplorerProps }
type State = { ref: Ref }

/** Rows above the list: the breadcrumb and a rule. */
const HEAD = 2

const LABELS = { view: ' VIEW MODE ', edit: ' EDIT MODE ', readonly: ' READ ONLY ' } as const

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
    rows: arr(p.rows),
    top: typeof p.top === 'number' ? p.top : 0,
    room: typeof p.room === 'number' ? p.room : 10,
    width: typeof p.width === 'number' ? p.width : 60,
    code: p.code && typeof p.code.source === 'string' ? p.code : null,
    note: typeof p.note === 'string' ? p.note : null,
    empty: typeof p.empty === 'string' ? p.empty : null,
    colors: { ...FALLBACK, ...(p.colors ?? {}) },
    fileMode: p.fileMode === 'view' || p.fileMode === 'edit' || p.fileMode === 'readonly' ? p.fileMode : null,
    isDirty: p.isDirty === true,
    edit: p.edit && Array.isArray(p.edit.lines) ? p.edit : null,
  }
}

const Explorer: ClientModule<ExplorerProps, State> = (rawProps, surface) => {
  const { Box, Text, Code } = surface.elements
  const props = complete(rawProps)
  const ref = surface.state?.ref ?? { props }
  ref.props = props

  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.onKey(k => {
      surface.post({ k: 'key', key: k.key, ctrl: k.ctrl ?? false, meta: k.meta ?? false, room: ref.props.room })
    })
    surface.onPointer(p => {
      if (p.type !== 'down' || p.button !== 'left') return
      const cur = ref.props
      // The mode label toggles view and edit; the rest of the breadcrumb goes back.
      const label = cur.fileMode ? LABELS[cur.fileMode] : ''
      if (p.y === 0 && label && p.x >= Math.max(20, cur.width) - label.length) return surface.post({ k: 'mode', room: cur.room })
      if (p.y === 0) return surface.post({ k: 'crumb', room: cur.room })
      if (cur.edit) {
        const row = p.y - HEAD - (cur.note ? 1 : 0)
        if (row < 0 || row >= cur.edit.lines.length) return
        const vis = p.x - cur.edit.gutterW - 3 + (row === cur.edit.cursorRow ? cur.edit.hoff : 0)
        return surface.post({ k: 'place', row, vis, room: cur.room })
      }
      const i = p.y - HEAD
      if (cur.mode === 'list' && i >= 0 && i < cur.rows.length) surface.post({ k: 'click', index: cur.top + i, room: cur.room })
    })
  }

  const c = props.colors
  const W = Math.max(20, props.width)
  const metaW = props.mode === 'list' ? Math.min(20, Math.max(0, W - 24)) : 0
  const nameW = Math.max(6, W - metaW - 4)

  const crumbs = (
    <Box flexDirection="row" justifyContent="space-between" width={W}>
      <Text wrap="truncate-start">
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
      <Text>
        <Text color={c.dim}>{props.counter}</Text>
        {props.isDirty ? <Text color={c.warn}>{'  ● modified'}</Text> : null}
        {props.fileMode ? (
          <Text>
            {'  '}
            <Text
              backgroundColor={props.fileMode === 'edit' ? c.warn : props.fileMode === 'view' ? c.accent : c.dim}
              color={c.pillFg}
              bold
            >
              {LABELS[props.fileMode]}
            </Text>
          </Text>
        ) : null}
      </Text>
    </Box>
  )

  const list = (
    <Box flexDirection="column" height={props.room}>
      {props.empty ? (
        <Text color={c.dim} italic>
          {`  ${props.empty}`}
        </Text>
      ) : null}
      {props.rows.map((r, i) => {
        const bg = r.isSelected ? c.selectedBg : undefined
        const nameColor = r.isDir ? c.dir : r.isTouched ? c.touched : c.text
        return (
          <Box key={`row${i}`} flexDirection="row" width={W}>
            <Text backgroundColor={bg} color={r.isSelected ? c.accent : c.dim} hover={{ backgroundColor: c.hoverBg }}>
              {r.isSelected ? '▌' : ' '}
            </Text>
            <Text backgroundColor={bg} color={r.isTouched ? c.touched : r.isDir ? c.dir : c.dim} hover={{ backgroundColor: c.hoverBg }}>
              {`${r.isTouched ? '✎' : r.icon} `}
            </Text>
            <Box width={nameW}>
              <Text
                backgroundColor={bg}
                color={nameColor}
                bold={r.isSelected || r.isDir}
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
              <Text color={c.dim}>{gutter}</Text>
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
            <Text color={c.warn} bold>
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

  const preview = (
    <Box flexDirection="column" height={props.room}>
      {props.note ? <Text color={c.warn}>{`⚠ ${props.note}`}</Text> : null}
      {editor}
      {props.code && props.code.source ? (
        <Code source={props.code.source} path={props.code.path} startLine={props.code.startLine} wrap="truncate-end" />
      ) : null}
    </Box>
  )

  return (
    <Box flexDirection="column" width={W}>
      {crumbs}
      <Text color={c.dim}>{'─'.repeat(W)}</Text>
      {props.mode === 'list' ? list : preview}
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
  )
}

export default Explorer
