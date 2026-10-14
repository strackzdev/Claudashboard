// Pure logic for STRACKZDEVHUB: formatting numbers, sizes, times, models and text. No `$` here, so it is testable.

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export const fmtUsd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`)

export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** `claude-opus-5-5[1m]` → `opus 5.5`. */
export function prettyModel(id: string): string {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(id)
  if (!m) return id || '—'
  return `${(m[1] ?? '').toLowerCase()} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}`
}

export function gauge(pct: number, width: number): string {
  const n = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '▰'.repeat(n) + '▱'.repeat(width - n)
}

export const EFFORT_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return '7d'
  return kind.replace(/_/g, ' ')
}

/** Shortens text to `n` cells, keeping the end (a path's useful part). */
export function clipStart(text: string, n: number): string {
  return text.length <= n ? text : `…${text.slice(text.length - n + 1)}`
}

export function clipEnd(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, Math.max(0, n - 1))}…`
}

/** Shortens text to `n` cells from the middle, keeping both ends: `very-long…name.ts`. */
export function clipMiddle(text: string, n: number): string {
  if (text.length <= n) return text
  if (n <= 1) return '…'
  const head = Math.ceil((n - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - (n - 1 - head))}`
}

/** `[1m]` on a model id is the 1M-token context variant. */
export const hasLongContext = (id: string) => /\[1m\]/i.test(id)

export function modeColorKey(mode: string): 'ok' | 'info' | 'purple' | 'bad' | 'dim' {
  if (mode === 'auto') return 'ok'
  if (mode === 'plan') return 'info'
  if (mode === 'acceptEdits') return 'purple'
  if (mode === 'bypassPermissions') return 'bad'
  return 'dim'
}

/** Values as one bar each, `▁` to `█`, scaled to the largest: `[1, 4, 2]` → `▂█▄`. */
export function sparkline(values: readonly number[]): string {
  const bars = '▁▂▃▄▅▆▇█'
  const max = Math.max(0, ...values)
  return values.map(v => (max > 0 ? (bars[Math.min(7, Math.max(0, Math.round((v / max) * 7)))] ?? '▁') : '▁')).join('')
}
