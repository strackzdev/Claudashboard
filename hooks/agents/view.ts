// Pure logic for Claudashboard: the agents tab's lines (running cards, then the finished history) and its keys. No `$` here, so it is testable.
import type { Agent, View } from '../../types'
import type { Key } from '../explorer/model'
import { clamp, fmtTokens, prettyModel } from '../shared/format'

export type AgentLine =
  | { kind: 'title'; text: string }
  | { kind: 'gap' }
  | { kind: 'empty'; text: string }
  /** A running agent's first line; its timer ticks on the client from `startedAt`. */
  | { kind: 'run'; name: string; type: string; model: string; stats: string; startedAt: number; isBackground: boolean }
  | { kind: 'task'; task: string; tool: string }
  | { kind: 'done'; name: string; type: string; model: string; stats: string; ms: number; task: string }

const statsOf = (a: Agent) => `${a.steps} steps · ${a.tools} tools${a.ctx ? ` · ${fmtTokens(a.ctx)} ctx` : ''}`

/** The tab's lines: running agents (two lines each), then finished ones, latest first (one line each). */
export function agentLines(list: Agent[]): AgentLine[] {
  const running = list.filter(a => a.endedAt === null)
  const finished = list.filter(a => a.endedAt !== null).reverse()
  const lines: AgentLine[] = [{ kind: 'title', text: `Running · ${running.length}` }]
  if (running.length === 0) lines.push({ kind: 'empty', text: 'No agent is running.' })
  for (const a of running) {
    const model = a.model ? prettyModel(a.model) : ''
    lines.push({ kind: 'run', name: a.name, type: a.type, model, stats: statsOf(a), startedAt: a.startedAt, isBackground: a.isBackground })
    lines.push({ kind: 'task', task: a.task, tool: a.lastTool })
  }
  lines.push({ kind: 'gap' }, { kind: 'title', text: `Finished · ${finished.length}` })
  if (finished.length === 0) lines.push({ kind: 'empty', text: 'Agents show here once they finish.' })
  for (const a of finished) {
    const model = a.model ? prettyModel(a.model) : ''
    lines.push({ kind: 'done', name: a.name, type: a.type, model, stats: statsOf(a), ms: (a.endedAt ?? a.startedAt) - a.startedAt, task: a.task })
  }
  return lines
}

export type AgentsEffect = { kind: 'clear' } | null

/** One key on the agents tab: arrows and pages scroll, `c` clears the history. */
export function reduceAgentsKey(v: View, k: Key, total: number, room: number): { view: View; effect: AgentsEffect } {
  const last = Math.max(0, total - room)
  const scroll = (top: number) => ({ view: { ...v, agentsTop: clamp(top, 0, last) }, effect: null })
  const key = k.key
  if (key === 'down' || key === 'j') return scroll(v.agentsTop + 1)
  if (key === 'up' || key === 'k') return scroll(v.agentsTop - 1)
  if (key === 'pagedown' || key === 'space') return scroll(v.agentsTop + Math.max(1, room - 1))
  if (key === 'pageup') return scroll(v.agentsTop - Math.max(1, room - 1))
  if (key === 'home' || key === 'g') return scroll(0)
  if (key === 'end' || key === 'G') return scroll(last)
  if (key === 'c') return { view: { ...v, agentsTop: 0 }, effect: { kind: 'clear' } }
  return { view: v, effect: null }
}
