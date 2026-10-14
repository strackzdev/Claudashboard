// Pure logic for Claudashboard: markdown and pictures in the preview. No `$` here, so it is testable.

const MARKDOWN = /\.(md|markdown|mdx)$/i
const PICTURE = /\.(png|jpe?g|gif|webp|bmp)$/i

/** How a file shows in the preview, by its name. */
export function kindOf(path: string): 'text' | 'markdown' | 'image' {
  if (MARKDOWN.test(path)) return 'markdown'
  if (PICTURE.test(path)) return 'image'
  return 'text'
}

/**
 * The markdown for the lines in view. A window that starts inside a fenced code block reopens
 * the fence, so the rest of the window does not read as a code block turned inside out.
 */
export function markdownWindow(lines: readonly string[], top: number, count: number): string {
  let isInFence = false
  for (let i = 0; i < top && i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i] ?? '')) isInFence = !isInFence
  }
  const body = lines.slice(top, top + count).join('\n')
  return isInFence ? `\`\`\`\n${body}` : body
}

/** A PNG's pixel size from its IHDR chunk, or null for anything else. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null
  const u32 = (o: number) => (((bytes[o] ?? 0) << 24) | ((bytes[o + 1] ?? 0) << 16) | ((bytes[o + 2] ?? 0) << 8) | (bytes[o + 3] ?? 0)) >>> 0
  const width = u32(16)
  const height = u32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * The cell box a picture fills at its own proportions within `maxCols` × `maxRows`: a terminal
 * cell is about twice as tall as wide. Never wider than the picture's own pixels allow.
 */
export function fitPicture(width: number, height: number, maxCols: number, maxRows: number): { columns: number; rows: number } {
  const ratio = height / width / 2 // rows per column
  let columns = Math.max(1, Math.min(maxCols, 255, Math.ceil(width / 8)))
  let rows = Math.max(1, Math.round(columns * ratio))
  if (rows > maxRows) {
    rows = Math.max(1, Math.min(maxRows, 255))
    columns = Math.max(1, Math.min(maxCols, Math.round(rows / ratio)))
  }
  return { columns, rows }
}

/** Decodes base64 (the start of a file is enough for a PNG's size). */
export function fromBase64(text: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let value = 0
  let o = 0
  for (const ch of clean) {
    value = (value << 6) | alphabet.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (value >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}
