// Pure logic for Claudashboard: subagent cards and what their tool calls do. No `$` here, so it is testable.
import type { Agent } from '../../types'
import { baseName, toSlash } from '../shared/paths'

/** One line on what a tool call does: `Read middleware.ts`, `Bash npm test`. */
export function describeTool(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const file = str('file_path') || str('notebook_path') || str('path')
  if (file && /^(Read|Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return `${tool} ${baseName(toSlash(file))}`
  if (tool === 'Bash') return `$ ${str('command').split('\n')[0]}`
  if (tool === 'Grep' || tool === 'Glob') return `${tool} ${str('pattern')}`
  if (tool === 'WebFetch') return `fetch ${str('url').replace(/^https?:\/\//, '')}`
  if (tool === 'WebSearch') return `search ${str('query')}`
  return tool
}

/** The model a step reports, applied to its agent: context is the step's whole input; output adds up. */
export function stepAgent<A extends { steps: number; ctx: number; out: number; model: string }>(
  a: A,
  model: string,
  usage: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | null | undefined,
): A {
  const u = usage ?? {}
  const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return { ...a, model: a.model || model, steps: a.steps + 1, ctx: ctx > 0 ? ctx : a.ctx, out: a.out + (u.output_tokens ?? 0) }
}

/** A stored or partial agent with every field present, so a card from an older version still draws. */
export function normalizeAgent(a: Partial<Agent> & { id: string }): Agent {
  return {
    name: 'agent',
    type: 'agent',
    model: '',
    task: '',
    startedAt: 0,
    steps: 0,
    ctx: 0,
    out: 0,
    tools: 0,
    lastTool: '',
    isBackground: false,
    ...a,
    endedAt: a.endedAt ?? null,
  }
}

/** Finished agents kept in the history, and running ones kept (one whose end never came stays until it is pushed out). */
export const MAX_FINISHED = 20
export const MAX_RUNNING = 24

/** The list to store: the most recent running and finished agents, in their order. */
export function keepAgents(list: Agent[]): Agent[] {
  const oldest = (xs: Agent[], keep: number) => xs.slice(0, Math.max(0, xs.length - keep))
  const dropped = new Set([
    ...oldest(
      list.filter(a => a.endedAt === null),
      MAX_RUNNING,
    ),
    ...oldest(
      list.filter(a => a.endedAt !== null),
      MAX_FINISHED,
    ),
  ])
  return list.filter(a => !dropped.has(a))
}

/** The agent `id` finished at `now`: it moves to the history. */
export function finishAgent(list: Agent[], id: string, now: number): Agent[] {
  return keepAgents(list.map(a => (a.id === id && a.endedAt === null ? { ...a, endedAt: now, lastTool: '' } : a)))
}
