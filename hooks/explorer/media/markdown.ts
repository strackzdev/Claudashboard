// Pure logic for Claudashboard: markdown laid out as rows of styled text, so the view knows every row it draws. No `$` here, so it is testable.
//
// The engine's own Markdown element wraps and merges lines itself; a window of it can neither be scrolled by a
// row nor kept inside its box. These rows can: one per line on screen, each knowing the source line it came from.

export type MdStyle = 'text' | 'bold' | 'italic' | 'boldItalic' | 'code' | 'link' | 'strike' | 'dim'
export type MdSpan = { text: string; style: MdStyle }
export type MdKind = 'text' | 'h1' | 'h2' | 'h3' | 'code' | 'rule' | 'table' | 'quote' | 'blank'
/** One drawn row: its kind (the client colours by it), its spans, and the source line it starts at. */
export type MdRow = { kind: MdKind; spans: MdSpan[]; src: number }

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const isTableStart = (lines: readonly string[], i: number) =>
  (lines[i] ?? '').includes('|') && TABLE_RULE.test(lines[i + 1] ?? '') && (lines[i + 1] ?? '').includes('-')
const startsBlock = (lines: readonly string[], i: number) => {
  const l = lines[i] ?? ''
  return FENCE.test(l) || HEADING.test(l) || RULE.test(l) || LIST.test(l) || QUOTE.test(l) || isTableStart(lines, i)
}

/** Inline markdown as spans: code, bold, italic, strikethrough, links (their text), images (their alt). */
export function inline(text: string, base: MdStyle = 'text'): MdSpan[] {
  const out: MdSpan[] = []
  const re =
    /(`+)(.+?)\1|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:.*?[^*\s])?)\*|(?<![\w])_([^_\s](?:.*?[^_\s])?)_(?![\w])|~~(.+?)~~|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)|<(https?:\/\/[^>\s]+)>/g
  const strong: MdStyle = base === 'italic' ? 'boldItalic' : 'bold'
  const em: MdStyle = base === 'bold' ? 'boldItalic' : 'italic'
  let at = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > at) out.push({ text: text.slice(at, i), style: base })
    if (m[2] !== undefined) out.push({ text: m[2].trim() || m[2], style: 'code' })
    else if (m[3] !== undefined) out.push({ text: m[3], style: 'boldItalic' })
    else if (m[4] !== undefined || m[5] !== undefined) out.push(...inline(m[4] ?? m[5] ?? '', strong))
    else if (m[6] !== undefined || m[7] !== undefined) out.push(...inline(m[6] ?? m[7] ?? '', em))
    else if (m[8] !== undefined) out.push({ text: m[8], style: 'strike' })
    else if (m[9] !== undefined) out.push({ text: `🖼 ${m[9] || 'image'}`, style: 'dim' })
    else if (m[10] !== undefined) out.push(...inline(m[10], 'link'))
    else if (m[11] !== undefined) out.push({ text: m[11], style: 'link' })
    at = i + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at), style: base })
  return out.map(s => ({ ...s, text: s.text.replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1') }))
}

const spanLen = (spans: readonly MdSpan[]) => spans.reduce((n, s) => n + s.text.length, 0)

/** Joins neighbours of one style, so a row draws as few pieces as it can. */
function merge(spans: MdSpan[]): MdSpan[] {
  const out: MdSpan[] = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && last.style === s.style) last.text += s.text
    else if (s.text) out.push({ ...s })
  }
  return out
}

/**
 * Spans wrapped at word boundaries into rows `width` wide; the first row starts with `first`, the rest with
 * `rest` (a list item's bullet, then its hanging indent). A word may change style midway (`(` then a code
 * span) and still stays whole; only a word longer than a row is cut.
 */
export function wrap(spans: readonly MdSpan[], width: number, first: MdSpan[] = [], rest: MdSpan[] = first): MdSpan[][] {
  // Words as pieces of styled text, split only at whitespace.
  const words: MdSpan[][] = []
  let word: MdSpan[] = []
  for (const s of spans) {
    for (const token of s.text.split(/(\s+)/)) {
      if (!token) continue
      if (/^\s+$/.test(token)) {
        if (word.length) words.push(word)
        word = []
      } else word.push({ text: token, style: s.style })
    }
  }
  if (word.length) words.push(word)

  const rows: MdSpan[][] = []
  let row: MdSpan[] = [...first]
  let used = spanLen(first)
  let isEmpty = true
  const newRow = () => {
    rows.push(merge(row))
    row = [...rest]
    used = spanLen(rest)
    isEmpty = true
  }
  for (const w of words) {
    const len = spanLen(w)
    const gap = isEmpty ? 0 : 1
    if (!isEmpty && used + gap + len > width) newRow()
    if (!isEmpty) {
      // The space between two words takes their style only when both share it (a bold phrase), else none.
      const before = row[row.length - 1]?.style
      row.push({ text: ' ', style: before === w[0]?.style && before !== undefined ? before : 'text' })
      used += 1
    }
    // A word longer than a row fills rows, cut where each ends.
    for (const piece of w) {
      let text = piece.text
      while (used + text.length > width && used < width) {
        const room = width - used
        row.push({ text: text.slice(0, room), style: piece.style })
        text = text.slice(room)
        newRow()
      }
      if (text) {
        if (used >= width) newRow()
        row.push({ text, style: piece.style })
        used += text.length
      }
    }
    isEmpty = false
  }
  if (!isEmpty || rows.length === 0) rows.push(merge(row))
  return rows
}

type Align = 'left' | 'right' | 'center'

/** A table row's cells, the outer pipes dropped. */
const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.trim().replace(/\\\|/g, '|'))

/** Columns no narrower than this; a table that cannot give each one this much draws one cell per row. */
const MIN_COL = 3

/** A table as rows: box borders, the header bold, each cell wrapped in its column; too narrow, one cell per row. */
function tableRows(lines: readonly string[], src: number, width: number): MdRow[] {
  const head = cellsOf(lines[0] ?? '')
  const n = head.length
  const aligns: Align[] = cellsOf(lines[1] ?? '').map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'))
  const body = lines.slice(2).map(l => {
    const c = cellsOf(l)
    return Array.from({ length: n }, (_, j) => c[j] ?? '')
  })
  const dim = (text: string): MdSpan => ({ text, style: 'dim' })
  const avail = width - 3 * n - 1
  if (avail < MIN_COL * n) {
    // One cell per row: each row's cells under their header, a rule between rows.
    const out: MdRow[] = []
    body.forEach((cells, r) => {
      if (r > 0) out.push({ kind: 'table', spans: [dim('─'.repeat(Math.max(1, width)))], src: src + 2 + r })
      cells.forEach((cell, j) => {
        for (const spans of wrap(inline(cell), width, [{ text: `${head[j] ?? ''}: `, style: 'bold' }], [{ text: '  ', style: 'text' }])) {
          out.push({ kind: 'table', spans, src: src + 2 + r })
        }
      })
    })
    return out
  }
  const natural = Array.from({ length: n }, (_, j) => Math.max(MIN_COL, spanLen(inline(head[j] ?? '')), ...body.map(r => spanLen(inline(r[j] ?? '')))))
  const widths = fitColumns(natural, avail)
  const line = (l: string, m: string, r: string) => dim(`${l}${widths.map(w => '─'.repeat(w + 2)).join(m)}${r}`)
  const rowOf = (cells: string[], at: number, isHead: boolean): MdRow[] => {
    const wrapped = cells.map((cell, j) => wrap(inline(cell, isHead ? 'bold' : 'text'), widths[j] ?? MIN_COL))
    const height = Math.max(1, ...wrapped.map(w => w.length))
    return Array.from({ length: height }, (_, k) => {
      const spans: MdSpan[] = [dim('│')]
      wrapped.forEach((rows, j) => {
        const cell = rows[k] ?? []
        const pad = Math.max(0, (widths[j] ?? 0) - spanLen(cell))
        const align = aligns[j] ?? 'left'
        const left = align === 'right' ? pad : align === 'center' ? Math.floor(pad / 2) : 0
        spans.push({ text: ` ${' '.repeat(left)}`, style: 'text' }, ...cell, { text: `${' '.repeat(pad - left)} `, style: 'text' }, dim('│'))
      })
      return { kind: 'table' as const, spans: merge(spans), src: at }
    })
  }
  return [
    { kind: 'table', spans: [line('┌', '┬', '┐')], src },
    ...rowOf(head, src, true),
    { kind: 'table', spans: [line('├', '┼', '┤')], src: src + 1 },
    ...body.flatMap((cells, r) => rowOf(cells, src + 2 + r, false)),
    { kind: 'table', spans: [line('└', '┴', '┘')], src: src + 1 + body.length },
  ]
}

/** Column widths that fit `avail`: each its natural width when they all fit, else the room shared out, narrow ones first. */
export function fitColumns(natural: number[], avail: number): number[] {
  if (natural.reduce((a, b) => a + b, 0) <= avail) return natural
  const widths = natural.map(() => 0)
  let left = avail
  let open = natural.map((_, j) => j)
  // Columns narrower than an even share take what they need; the rest split what is left.
  for (;;) {
    const share = Math.floor(left / Math.max(1, open.length))
    const small = open.filter(j => (natural[j] ?? 0) <= share)
    if (small.length === 0) break
    for (const j of small) {
      widths[j] = natural[j] ?? 0
      left -= widths[j] ?? 0
    }
    open = open.filter(j => !small.includes(j))
  }
  const share = Math.floor(left / Math.max(1, open.length))
  open.forEach((j, k) => {
    widths[j] = Math.max(MIN_COL, share + (k < left - share * open.length ? 1 : 0))
  })
  return widths
}

/** The last layout, kept: the view lays out the same file on every draw and key. */
let last: { lines: readonly string[]; width: number; rows: MdRow[] } | null = null

/** The markdown file as drawn rows, `width` cells wide. */
export function renderMarkdown(lines: readonly string[], width: number): MdRow[] {
  if (last && last.lines === lines && last.width === width) return last.rows
  const rows = layout(lines, width)
  last = { lines, width, rows }
  return rows
}

/** The row a source line starts at, for switching from the source to the rendered view in place. */
export const rowOfLine = (rows: readonly MdRow[], line: number) =>
  Math.max(
    0,
    rows.findIndex(r => r.src >= line),
  )

function layout(lines: readonly string[], width: number): MdRow[] {
  const W = Math.max(10, width)
  const rows: MdRow[] = []
  let gap = false
  const push = (kind: MdKind, spans: MdSpan[][], src: number) => {
    // Blocks are kept apart by one blank row, where the source had blank lines between them, and always before a heading.
    const last = rows[rows.length - 1]
    if (last && last.kind !== 'blank' && (gap || kind === 'h1' || kind === 'h2' || kind === 'h3')) rows.push({ kind: 'blank', spans: [], src })
    gap = false
    for (const s of spans) rows.push({ kind, spans: s, src })
  }
  let i = 0
  while (i < lines.length) {
    const l = lines[i] ?? ''
    if (!l.trim()) {
      gap = true
      i++
      continue
    }
    const fence = FENCE.exec(l)
    if (fence) {
      const mark = fence[2] ?? '```'
      const lang = fence[3] ?? ''
      const start = i++
      const code: number[] = []
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(mark)) code.push(i++)
      i++ // the closing fence
      push('code', [[{ text: `╭─ ${lang || 'code'} `, style: 'dim' }]], start)
      for (const at of code) {
        const text = (lines[at] ?? '').replace(/\t/g, '  ')
        const parts = text.length ? (text.match(new RegExp(`.{1,${Math.max(1, W - 2)}}`, 'g')) ?? ['']) : ['']
        for (const part of parts)
          rows.push({
            kind: 'code',
            spans: [
              { text: '│ ', style: 'dim' },
              { text: part, style: 'code' },
            ],
            src: at,
          })
      }
      rows.push({ kind: 'code', spans: [{ text: '╰─', style: 'dim' }], src: Math.max(start, i - 1) })
      continue
    }
    const heading = HEADING.exec(l)
    if (heading) {
      const level = (heading[1] ?? '#').length
      const kind: MdKind = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      push(kind, wrap(inline(heading[2] ?? '', 'bold'), W), i)
      if (level === 1)
        rows.push({ kind: 'h1', spans: [{ text: '━'.repeat(Math.min(W, Math.max(3, spanLen(inline(heading[2] ?? ''))))), style: 'dim' }], src: i })
      i++
      continue
    }
    if (RULE.test(l)) {
      push('rule', [[{ text: '─'.repeat(W), style: 'dim' }]], i)
      i++
      continue
    }
    if (isTableStart(lines, i)) {
      const start = i
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim()) i++
      const table = tableRows(lines.slice(start, i), start, W)
      push('table', [], start)
      rows.push(...table)
      continue
    }
    if (QUOTE.test(l)) {
      const start = i
      const text: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) text.push(QUOTE.exec(lines[i++] ?? '')?.[1] ?? '')
      push('quote', wrap(inline(text.join(' '), 'italic'), W, [{ text: '▎ ', style: 'dim' }]), start)
      continue
    }
    const item = LIST.exec(l)
    if (item) {
      const indent = (item[1] ?? '').replace(/\t/g, '    ').length
      const level = Math.min(3, Math.floor(indent / 2))
      const marker = item[2] ?? '-'
      const start = i++
      let text = item[3] ?? ''
      // Lines that carry on the item: not blank, not a new item or block.
      while (i < lines.length && (lines[i] ?? '').trim() && !startsBlock(lines, i)) text += ` ${(lines[i++] ?? '').trim()}`
      const task = /^\[([ xX])\]\s+/.exec(text)
      const bullet = task ? (task[1] === ' ' ? '☐' : '☑') : /\d/.test(marker) ? marker : (['•', '◦', '▪', '▫'][level] ?? '•')
      if (task) text = text.slice(task[0].length)
      const pad = '  '.repeat(level)
      const lead = `${pad}${bullet} `
      push('text', wrap(inline(text), W, [{ text: lead, style: 'dim' }], [{ text: ' '.repeat(lead.length), style: 'text' }]), start)
      continue
    }
    // A paragraph: lines up to a blank line or the next block, joined. HTML tags are left out; a
    // <summary> reads as the fold it stands for.
    const start = i
    const text: string[] = []
    while (i < lines.length && (lines[i] ?? '').trim() && (i === start || !startsBlock(lines, i))) text.push((lines[i++] ?? '').trim())
    const joined = text
      .join(' ')
      .replace(/<summary>/gi, '▸ ')
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      .trim()
    if (joined) push('text', wrap(inline(joined), W), start)
  }
  return rows
}
