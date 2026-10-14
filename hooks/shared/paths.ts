// Pure logic for Claudashboard: joining and splitting paths. No `$` here, so it is testable.

export const joinPath = (root: string, rel: string) => (rel ? `${root.replace(/\/+$/, '')}/${rel}` : root)

export const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

export const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)

/** A path relative to `root` when inside it, else the absolute path as given. */
export function relTo(root: string, abs: string): string {
  const r = root.replace(/\/+$/, '')
  return abs.startsWith(`${r}/`) ? abs.slice(r.length + 1) : abs
}

/** A path with `/` between its parts: Windows hands out `C:\a\b`, the explorer and git use `C:/a/b`. */
export const toSlash = (path: string) => path.replace(/\\/g, '/')

/** `/a` or `C:/a`; the path already has `/` separators. */
export const isAbsolute = (path: string) => /^([A-Za-z]:)?\//.test(path)
