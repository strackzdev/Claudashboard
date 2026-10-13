// The pane's drawing: three boxes from the stored state, the explorer drawn by its client module.
import type { On } from 'claude-code'
import type { Palette } from './explorer'
import { EFFORT_LEVEL, clipEnd, fmtDuration, fmtTokens, fmtUsd, gauge, hasLongContext, limitLabel, modeColorKey, prettyModel } from './format'
import { bases } from './git'
import { explorerProps } from './explorer-props'
import { fitPicture } from './media'
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
    const props = explorerProps({ ex, touched: t, now, room, width: inner, colors: C, base: ex.preview ? bases.get(ex.preview.path) ?? null : null, disk: ex.preview ? saved.get(ex.preview.path) ?? null : null })

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
