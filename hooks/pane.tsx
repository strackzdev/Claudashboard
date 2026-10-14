// The pane's drawing: three boxes from the stored state, the explorer drawn by its client module.
import type { On } from 'claude-code'
import type { Palette } from './explorer/client'
import { EFFORT_LEVEL, fmtDuration, fmtTokens, fmtUsd, gauge, hasLongContext, limitLabel, modeColorKey, prettyModel, sparkline } from './shared/format'
import { bases } from './explorer/git/git'
import { bodyProps } from './explorer/props'
import { fitPicture } from './explorer/media/media'
import { contextLevel, turnStats } from './session/vitals'
import { baseName } from './shared/paths'
import { PANE, getActivity, getAgents, getExplorer, getTouched, getView, getVitals, paneState, readGitTick, saved } from './state'

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

/** Draws the pane: the session's vitals, and the tabbed body (files or agents). */
export const registerPane = (on: On, C: Colors) => {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Drawn means open: the live refresh runs from here until the pane closes.
    paneState.isOpen = true
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const hasClient = 'Client' in els
    const [v, ex, t, list, now, act, view] = await Promise.all([
      getVitals($),
      getExplorer($),
      getTouched($),
      getAgents($),
      $.clock.now(),
      getActivity($),
      getView($),
      readGitTick($),
    ])
    // The pane's real width: drawing wider than it would overflow; every row below truncates instead.
    const W = Math.max(24, e.props.bodyColumns)
    const inner = W - 4 // a section's round border and its one-cell padding each side
    const bodyRows = Math.max(8, e.props.scroll.bodyRows)

    const clock = (key: string, since: number, color: string) =>
      hasClient ? <els.Client key={key} module="./elapsed.tsx" props={{ since, now, color }} /> : <Text color={color}>{fmtDuration(now - since)}</Text>

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
    // The turns row: oldest turn left, the latest right; sparklines shorten on a narrow pane so both series fit.
    const ts = turnStats(v.turns)
    const sparkW = Math.max(3, Math.min(16, Math.floor((inner - 50) / 2)))
    const effortN = EFFORT_LEVEL[v.effort] ?? 0
    const pct = v.pct ?? 0
    // From 80% the box warns, from 90% it says to compact: frame, gauge and a label beside it.
    const level = contextLevel(v.pct)
    const ctxColor = level === 2 ? C.bad : level === 1 ? C.warn : C.ok
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
            {level > 0 ? (
              <Text color={ctxColor} bold>
                {level === 2 ? '  ⚠ compact soon' : '  ⚠ filling up'}
              </Text>
            ) : null}
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
        {v.showTurns && ts.count === 0 ? (
          <Text color={C.dim} wrap="truncate-end">
            {'turns  none finished yet'}
          </Text>
        ) : null}
        {v.showTurns && ts.count > 0 ? (
          <Text wrap="truncate-end">
            <Text color={C.dim}>{`${ts.count} ${ts.count === 1 ? 'turn ' : 'turns'}  `}</Text>
            {ts.costs ? (
              <Text>
                <Text color={C.dim}>{'cost '}</Text>
                <Text color={C.ok}>{sparkline(ts.costs.slice(-sparkW))}</Text>
                <Text color={C.text}>{` ${ts.lastCost === null ? '—' : fmtUsd(ts.lastCost)}`}</Text>
                <Text color={C.dim}>{` (avg ${fmtUsd(ts.avgCost ?? 0)})   `}</Text>
              </Text>
            ) : null}
            <Text color={C.dim}>{'time '}</Text>
            <Text color={C.accent}>{sparkline(ts.times.slice(-sparkW))}</Text>
            <Text color={C.text}>{` ${fmtDuration(ts.lastMs)}`}</Text>
            <Text color={C.dim}>{` (avg ${fmtDuration(ts.avgMs)})`}</Text>
          </Text>
        ) : null}
      </Box>,
      level === 2 ? C.bad : level === 1 ? C.warn : C.frame,
    )
    const vitalsRows = 2 + 1 + 2 + (v.limits.length > 0 ? 1 : 0) + (v.showTurns ? 1 : 0)

    // ---- the body: the tab strip, the box's border, breadcrumb and rule, the rows, the hint line
    const room = Math.max(3, bodyRows - vitalsRows - 7)
    const props = bodyProps({
      view,
      agents: list,
      ex,
      touched: t,
      activity: act,
      now,
      room,
      width: inner,
      colors: C,
      base: ex.preview ? (bases.get(ex.preview.path) ?? null) : null,
      disk: ex.preview ? (saved.get(ex.preview.path) ?? null) : null,
    })

    // A picture is the pane's to draw (the explorer client cannot): over the explorer's empty body.
    const pic = props.body === 'files' && ex.preview?.kind === 'image' ? (ex.preview.image ?? null) : null
    const picRows = Math.max(1, room - (props.note ? 1 : 0))
    const picBox = pic ? fitPicture(pic.width, pic.height, inner, picRows) : null
    const picture =
      pic && picBox && 'Image' in els ? (
        <Box position="absolute" top={5 + (props.note ? 1 : 0)} left={2 + Math.floor((inner - picBox.columns) / 2)}>
          <els.Image key="picture" source={{ file: pic.file, format: 'png' }} columns={picBox.columns} rows={picBox.rows} alt={baseName(pic.file)} />
        </Box>
      ) : null

    // The client draws the box itself, so the tab strip can sit on its top edge.
    const frame = props.body === 'agents' ? C.info : props.body !== 'files' ? C.frame : ex.preview?.mode === 'edit' ? C.warn : ex.preview ? C.accent : C.frame
    const filesBox = (
      <Box flexDirection="column" width={W}>
        {hasClient ? (
          <els.Client key="explorer" module="./explorer/client.tsx" props={{ ...props, frame }} width={W} height={room + 7} />
        ) : (
          <Box borderStyle="round" borderColor={C.frame} paddingX={1} width={W}>
            <Text color={C.dim}>The file explorer needs a surface that runs client modules (the terminal does).</Text>
          </Box>
        )}
        {picture}
      </Box>
    )

    return (
      <Box flexDirection="column" width={W}>
        {vitalsBox}
        {filesBox}
      </Box>
    )
  })
}
