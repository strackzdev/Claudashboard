// Pure logic for Claudashboard: the help overlay's keys and its scrolling. No `$` here, so it is testable.
import type { View } from '../types'
import type { Key } from './explorer/model'
import { clamp } from './shared/format'

export type HelpLine = { kind: 'title'; text: string } | { kind: 'key'; key: string; label: string } | { kind: 'gap' }

/** Where the person pressed `?`: that part's keys come first. */
export type HelpContext = 'list' | 'file' | 'diff' | 'agents'

type Section = { id: HelpContext | 'everywhere' | 'edit' | 'finder'; title: string; keys: Array<[string, string]> }

const SECTIONS: Section[] = [
  {
    id: 'everywhere',
    title: 'Everywhere',
    keys: [
      ['Tab', 'switch tab: files ⇄ agents (or click a tab)'],
      ['?', 'this help'],
      ['f  ctrl+p', 'find a file by name'],
      ['Esc', 'hand the keyboard back to the prompt'],
    ],
  },
  {
    id: 'list',
    title: 'File list',
    keys: [
      ['↑↓  j k', 'move'],
      ['PgUp PgDn  Home End', 'page, first, last'],
      ['⏎  →  l', 'open'],
      ['⌫  ←  h', 'parent folder (clears a filter first)'],
      ['/', 'filter by name (⏎ or Tab to finish)'],
      ['.', 'show / hide dotfiles'],
      ['t', 'only touched files'],
      ['r', 'refresh'],
      ['e', 'open the file in edit mode'],
      ['@', 'insert @path into your prompt'],
    ],
  },
  {
    id: 'file',
    title: 'File view',
    keys: [
      ['↑↓  j k', 'scroll'],
      ['PgUp PgDn  Space', 'page'],
      ['g G  Home End', 'top, end'],
      ['e', 'edit'],
      ['d', 'diff against the last commit'],
      ['m', 'markdown: rendered ⇄ source'],
      ['click, shift+click, drag', 'pick lines'],
      ['@', 'mention the file (or the picked lines)'],
      ['r', 'refresh the git marks'],
      ['⌫  ←  h  q', 'back to the list'],
    ],
  },
  {
    id: 'diff',
    title: 'Diff view',
    keys: [
      ['↑↓  PgUp PgDn  g G', 'scroll'],
      ['d  ⌫', 'back to the file'],
      ['@', 'mention the file'],
    ],
  },
  {
    id: 'edit',
    title: 'Edit mode',
    keys: [
      ['ctrl+s', 'save'],
      ['ctrl+z', 'undo'],
      ['ctrl+e', 'back to view mode (twice to discard edits)'],
      ['⏎', 'new line, keeping the indentation'],
      ['Home End', 'line start (indentation first), end'],
      ['ctrl+Home ctrl+End', 'start, end of the file'],
      ['click', 'place the cursor'],
    ],
  },
  {
    id: 'finder',
    title: 'Finder',
    keys: [
      ['type', 'letters of the path, in order'],
      ['↑↓  ctrl+n ctrl+p', 'pick'],
      ['⏎  click', 'open'],
      ['ctrl+u', 'clear'],
      ['⌫ on an empty query', 'close'],
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    keys: [
      ['↑↓  PgUp PgDn', 'scroll'],
      ['c', 'clear the finished agents'],
    ],
  },
]

/** The help's lines: the section for where the person is first, then everywhere's keys, then the rest. */
export function helpLines(ctx: HelpContext): HelpLine[] {
  const order = [...SECTIONS].sort((a, b) => rank(a.id, ctx) - rank(b.id, ctx))
  return order.flatMap((s, i) => [
    ...(i > 0 ? [{ kind: 'gap' as const }] : []),
    { kind: 'title' as const, text: s.title },
    ...s.keys.map(([key, label]) => ({ kind: 'key' as const, key, label })),
  ])
}
const rank = (id: Section['id'], ctx: HelpContext) => (id === ctx ? 0 : id === 'everywhere' ? 1 : 2)

/** One key while the help shows: arrows and pages scroll it, anything else closes it. */
export function reduceHelp(v: View, k: Key, total: number, room: number): View {
  const last = Math.max(0, total - room)
  const scroll = (top: number) => ({ ...v, helpTop: clamp(top, 0, last) })
  if (k.key === 'down' || k.key === 'j') return scroll(v.helpTop + 1)
  if (k.key === 'up' || k.key === 'k') return scroll(v.helpTop - 1)
  if (k.key === 'pagedown' || k.key === 'space') return scroll(v.helpTop + Math.max(1, room - 1))
  if (k.key === 'pageup') return scroll(v.helpTop - Math.max(1, room - 1))
  return { ...v, help: false, helpTop: 0 }
}
