// Pure logic for STRACKZDEVHUB: fitting the file box's header to the pane's width. No `$` here, so it is testable.
import { clipMiddle } from '../shared/format'

const SEP = 3 // ' › '
const crumbsWidth = (parts: string[]) => parts.reduce((n, p) => n + p.length, 0) + SEP * Math.max(0, parts.length - 1)

/**
 * A breadcrumb that fits `width` cells: middle folders fold into `…` first (the root and the
 * nearest names stay), then the root goes, then the last name is cut from its middle.
 */
export function fitCrumbs(parts: string[], width: number): string[] {
  if (parts.length === 0 || crumbsWidth(parts) <= width) return parts
  for (let drop = 1; drop < parts.length - 1; drop++) {
    const candidate = [parts[0] ?? '', '…', ...parts.slice(1 + drop)]
    if (crumbsWidth(candidate) <= width) return candidate
  }
  const last = parts[parts.length - 1] ?? ''
  if (parts.length > 1 && crumbsWidth(['…', last]) <= width) return ['…', last]
  return [clipMiddle(last, Math.max(1, width))]
}

export type FileMode = 'view' | 'edit' | 'readonly'

export type HeaderFit = {
  crumbs: string[]
  label: string | null
  hint: { key: string; label: string } | null
  dirty: string | null
}

/**
 * The file box's header in `width` cells: the mode label always (short when narrow), then the
 * unsaved mark and the shortcut while the path keeps a fair share; the path takes what is left.
 */
export function fitHeader(o: { width: number; crumbs: string[]; filter: string | null; mode: FileMode | null; isDirty: boolean }): HeaderFit {
  const filterW = o.filter === null ? 0 : o.filter.length + 4
  const full = { view: ' VIEW MODE ', edit: ' EDIT MODE ', readonly: ' READ ONLY ' } as const
  const short = { view: ' VIEW ', edit: ' EDIT ', readonly: ' RO ' } as const
  const label = o.mode ? (o.width >= 44 ? full[o.mode] : short[o.mode]) : null
  // What the path needs, up to a fair share: it never gives up more than this for extras.
  const pathWant = Math.min(crumbsWidth(o.crumbs) + filterW, Math.max(16, Math.floor(o.width * 0.45)))
  let right = label ? label.length : 0
  const fits = (extra: number) => o.width - (right + extra) - 2 >= pathWant

  let dirty: string | null = null
  if (o.isDirty) {
    if (fits(' ● modified'.length + 1)) dirty = '● modified'
    else if (fits(2)) dirty = '●'
    if (dirty) right += dirty.length + 2
  }
  let hint: HeaderFit['hint'] = null
  if (o.mode === 'view' || o.mode === 'edit') {
    const h = o.mode === 'view' ? { key: 'e', label: 'to edit' } : { key: 'ctrl+e', label: 'to view' }
    const w = h.key.length + 1 + h.label.length + 2
    if (fits(w)) {
      hint = h
      right += w
    }
  }
  const crumbs = fitCrumbs(o.crumbs, Math.max(1, o.width - right - 2 - filterW))
  return { crumbs, label, hint, dirty }
}
