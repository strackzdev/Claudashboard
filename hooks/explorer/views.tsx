// Drawing for the explorer client's other bodies: the tab bar, the agents tab, the finder and the help.
// Plain functions of the client's elements and props; the client module calls them, so they run on the drawing surface.
import type { ClientElements } from 'claude-code'
import type { AgentLine } from '../agents/view'
import type { HelpLine } from '../help'
import type { ExplorerProps } from './client'

/** The tab strip's labels, and its width with the three bars around and between them. */
const FILES_TAB = ' FILES '
/** While agents run, the agents tab spins (one frame per tick) and counts them: ` ⠹ AGENTS (4) `. */
export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const agentsTab = (running: number, spin = 0) => (running ? ` ${SPINNER[spin % SPINNER.length]} AGENTS (${running}) ` : ' AGENTS ')
const stripWidth = (running: number) => FILES_TAB.length + agentsTab(running).length + 3

/** Which tab a click at column `x` of the strip's rows lands on, in a region `W` wide; the strip sits at its right. */
export function tabAt(x: number, W: number, running: number): 'files' | 'agents' | null {
  const at = x - (W - stripWidth(running)) - 1
  if (at >= 0 && at < FILES_TAB.length) return 'files'
  const agentsAt = at - FILES_TAB.length - 1
  return agentsAt >= 0 && agentsAt < agentsTab(running).length ? 'agents' : null
}

/**
 * The box's top edge, `W` wide, joined to the tabs above it at its right: the active tab stays open into
 * the box (`┘ … └`), the other closes on it (`┴ … ┴`), and the edge ends in `┤`, or `│` under an open last tab.
 */
export function boxTop(W: number, running: number, isAgents: boolean): string {
  const f = FILES_TAB.length
  const a = agentsTab(running).length
  const lead = '─'.repeat(Math.max(0, W - stripWidth(running) - 1))
  return isAgents ? `╭${lead}┴${'─'.repeat(f)}┘${' '.repeat(a)}│` : `╭${lead}┘${' '.repeat(f)}└${'─'.repeat(a)}┤`
}

/** The box around a body `H` rows tall and `W - 4` wide: the top edge joined to the tabs, the sides, the bottom. */
export function framed(els: ClientElements, p: ExplorerProps, W: number, H: number, body: unknown) {
  const { Box, Text } = els
  const edge = p.frame ?? p.colors.dim
  const side = (text: string) => (
    <Box flexDirection="column" width={2} flexShrink={0}>
      {Array.from({ length: H }, () => (
        <Text color={edge}>{text}</Text>
      ))}
    </Box>
  )
  return (
    <Box flexDirection="column" width={W}>
      <Text color={edge}>{boxTop(W, p.running ?? 0, p.tab === 'agents')}</Text>
      <Box flexDirection="row" width={W}>
        {side('│ ')}
        <Box flexDirection="column" width={W - 4} height={H} overflow="hidden">
          {body as never}
        </Box>
        {side(' │')}
      </Box>
      <Text color={edge}>{`╰${'─'.repeat(Math.max(0, W - 2))}╯`}</Text>
    </Box>
  )
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/**
 * Two rows over the box: the tabs at the right, sitting on its top edge, the active one bold in its colour;
 * on the files tab, the project bar at their left, inside a git repository.
 */
export function tabStrip(els: ClientElements, p: ExplorerProps, W: number, spin: number) {
  const { Box, Text } = els
  const c = p.colors
  const running = p.running ?? 0
  const isAgents = p.tab === 'agents'
  const tab = (label: string, isActive: boolean, color: string) => (
    <Text color={isActive || (running > 0 && color === c.info) ? color : c.dim} bold={isActive}>
      {label}
    </Text>
  )
  const r = isAgents ? null : (p.repo ?? null)
  const edge = p.frame ?? c.dim
  return (
    <Box flexDirection="column" width={W}>
      <Box flexDirection="row" justifyContent="flex-end" width={W}>
        <Text color={edge}>{`╭${'─'.repeat(FILES_TAB.length)}┬${'─'.repeat(agentsTab(running).length)}╮`}</Text>
      </Box>
      <Box flexDirection="row" justifyContent="space-between" width={W}>
        <Box flexShrink={1} marginLeft={1}>
          {r ? (
            <Text wrap="truncate-end">
              <Text color={c.purple} bold>
                {'⎇ '}
              </Text>
              <Text color={c.text} bold>
                {r.name}
              </Text>
              <Text color={c.dim}>{' on '}</Text>
              <Text color={c.purple}>{r.branch}</Text>
              {r.ahead ? <Text color={c.ok}>{` ↑${r.ahead}`}</Text> : null}
              {r.behind ? <Text color={c.bad}>{` ↓${r.behind}`}</Text> : null}
              <Text color={c.dim}>{'  '}</Text>
              {r.changed ? <Text color={c.warn}>{`${r.changed} changed`}</Text> : null}
              {r.changed && r.staged ? <Text color={c.dim}>{' · '}</Text> : null}
              {r.staged ? <Text color={c.ok}>{`${r.staged} staged`}</Text> : null}
              {!r.changed && !r.staged ? <Text color={c.ok}>{'✓ clean'}</Text> : null}
            </Text>
          ) : (
            <Text> </Text>
          )}
        </Box>
        <Box flexShrink={0}>
          <Text>
            <Text color={edge}>│</Text>
            {tab(FILES_TAB, !isAgents, c.accent)}
            <Text color={edge}>│</Text>
            {tab(agentsTab(running, spin), isAgents, c.info)}
            <Text color={edge}>│</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

/** The agents tab: running cards with a live timer (`elapsed` ms past `now`), then the finished history. */
export function agentsBody(els: ClientElements, p: ExplorerProps, W: number, elapsed: number) {
  const { Box, Text } = els
  const c = p.colors
  const now = (p.now ?? 0) + elapsed
  const line = (l: AgentLine) => {
    if (l.kind === 'title')
      return (
        <Text color={c.dim} bold>
          {l.text.toUpperCase()}
        </Text>
      )
    if (l.kind === 'gap') return <Text> </Text>
    if (l.kind === 'empty')
      return (
        <Text color={c.dim} italic wrap="truncate-end">
          {`  ${l.text}`}
        </Text>
      )
    if (l.kind === 'run')
      return (
        <Box flexDirection="row" justifyContent="space-between" width={W}>
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              <Text color={c.info}>◆ </Text>
              <Text color={c.text} bold>
                {l.name}
              </Text>
              {l.type !== l.name ? <Text color={c.dim}>{` ${l.type}`}</Text> : null}
              {l.model ? <Text color={c.purple}>{`  ${l.model}`}</Text> : null}
              <Text color={c.dim}>{`  ${l.stats}${l.isBackground ? ' · background' : ''}`}</Text>
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={1}>
            <Text color={c.info}>{clock(now - l.startedAt)}</Text>
          </Box>
        </Box>
      )
    if (l.kind === 'task')
      return (
        <Text wrap="truncate-end">
          <Text color={c.dim}>{'  ↳ '}</Text>
          <Text color={c.text}>{l.task}</Text>
          {l.tool ? <Text color={c.dim}>{`  ⟶ ${l.tool}`}</Text> : null}
        </Text>
      )
    return (
      <Box flexDirection="row" justifyContent="space-between" width={W}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color={c.ok}>✓ </Text>
            <Text color={c.text}>{l.name}</Text>
            {l.type !== l.name ? <Text color={c.dim}>{` ${l.type}`}</Text> : null}
            {l.model ? <Text color={c.purple}>{`  ${l.model}`}</Text> : null}
            <Text color={c.dim}>{`  ${l.stats}`}</Text>
            {l.task ? <Text color={c.dim}>{`  ↳ ${l.task}`}</Text> : null}
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          <Text color={c.dim}>{clock(l.ms)}</Text>
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" height={p.room}>
      {(p.agents ?? []).map(line)}
    </Box>
  )
}

/** The help: section titles, then each key and what it does, the keys in one column. */
export function helpBody(els: ClientElements, p: ExplorerProps) {
  const { Box, Text } = els
  const c = p.colors
  const keyW = Math.min(26, Math.max(8, Math.floor(p.width / 3)))
  const line = (l: HelpLine) =>
    l.kind === 'gap' ? (
      <Text> </Text>
    ) : l.kind === 'title' ? (
      <Text color={c.accent} bold>
        {l.text}
      </Text>
    ) : (
      <Text wrap="truncate-end">
        <Text color={c.accent} bold>
          {`  ${l.key}`.padEnd(keyW)}
        </Text>
        <Text color={c.text}>{` ${l.label}`}</Text>
      </Text>
    )
  return (
    <Box flexDirection="column" height={p.room}>
      {(p.help ?? []).map(line)}
    </Box>
  )
}

/** The finder's results: the path dim, its name bright, the matched letters in the accent colour. */
export function finderBody(els: ClientElements, p: ExplorerProps, W: number) {
  const { Box, Text } = els
  const c = p.colors
  return (
    <Box flexDirection="column" height={p.room}>
      {p.empty ? (
        <Text color={c.dim} italic wrap="truncate-end">
          {`  ${p.empty}`}
        </Text>
      ) : null}
      {(p.found ?? []).map(r => {
        const hit = new Set(r.hits)
        const nameAt = r.path.lastIndexOf('/') + 1
        const bg = r.isSelected ? c.selectedBg : undefined
        // Runs of letters that draw alike: matched or not, folder or name.
        const runs: Array<{ text: string; isHit: boolean; isName: boolean }> = []
        for (let i = 0; i < r.path.length; i++) {
          const isHit = hit.has(i)
          const isName = i >= nameAt
          const last = runs[runs.length - 1]
          if (last && last.isHit === isHit && last.isName === isName) last.text += r.path[i]
          else runs.push({ text: r.path[i] ?? '', isHit, isName })
        }
        return (
          <Box flexDirection="row" width={W}>
            <Text backgroundColor={bg} color={r.isSelected ? c.accent : c.dim}>
              {r.isSelected ? '▌ ' : '  '}
            </Text>
            <Text backgroundColor={bg} wrap="truncate-start">
              {runs.map(run => (
                <Text color={run.isHit ? c.accent : run.isName ? c.text : c.dim} bold={run.isHit || (run.isName && r.isSelected)}>
                  {run.text}
                </Text>
              ))}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
