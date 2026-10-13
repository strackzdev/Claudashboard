// The in-pane editor's lifecycle: entering and leaving edit mode, saving, undo.
import type { EngineInterface } from 'claude-code'
import type { Preview } from '../types'
import { colFromVisual, reduceEdit, textOf } from './editor'
import type { UiMessage } from './explorer'
import { hasNoteRow } from './explorer-state'
import { loadPreview } from './files'
import { MAX_UNDO, absOf, changedOnDisk, getExplorer, history, sameLines, saved, setPreview, toKey } from './state'

export async function enterEdit($: EngineInterface) {
  await setPreview($, p =>
    p.readOnly
      ? { ...p, status: `read-only: ${p.readOnly}` }
      : { ...p, mode: 'edit', row: Math.min(Math.max(p.row, p.top), Math.max(0, p.lines.length - 1)), status: null, confirm: null },
  )
}

/** Back to view mode; with unsaved edits the first press warns and a second discards them. */
export async function leaveEdit($: EngineInterface) {
  const p = (await getExplorer($)).preview
  if (!p) return
  if (!p.dirty) return setPreview($, x => ({ ...x, mode: 'view', status: null, confirm: null }))
  if (p.confirm !== 'discard') {
    return setPreview($, x => ({ ...x, status: 'unsaved changes: ctrl+s saves, ctrl+e again discards them', confirm: 'discard' }))
  }
  // Discard: read the file again as it is on disk.
  await loadPreview($, p.path, { top: p.top, row: p.row, col: p.col, status: 'changes discarded' })
}

export async function saveFile($: EngineInterface) {
  const ex = await getExplorer($)
  const p = ex.preview
  if (!p || p.mode !== 'edit') return
  if (p.readOnly) return setPreview($, x => ({ ...x, status: `read-only: ${p.readOnly}` }))
  const abs = absOf(ex.root, p.path)
  try {
    const st = await $.fs.stat(abs).catch(() => null)
    // Someone (Claude, another editor) changed the file since it was read: a second ctrl+s overwrites.
    if (changedOnDisk(st, p) && p.confirm !== 'overwrite') {
      return setPreview($, x => ({ ...x, status: 'the file changed on disk: ctrl+s again overwrites it, ctrl+e twice reloads it', confirm: 'overwrite' }))
    }
    await $.fs.write(abs, textOf(p))
    const after = await $.fs.stat(abs).catch(() => null)
    saved.set(p.path, p.lines)
    await setPreview($, x => ({ ...x, dirty: false, mtimeMs: after?.mtimeMs ?? x.mtimeMs, status: 'saved ✓', confirm: null }))
    $.ui.toast(`Saved ${p.path}`)
  } catch (err) {
    await setPreview($, x => ({ ...x, status: `cannot save: ${String(err)}`, confirm: null }))
  }
}

export async function undoEdit($: EngineInterface, room: number) {
  const p = (await getExplorer($)).preview
  if (!p) return
  const steps = history.get(p.path) ?? []
  const last = steps.pop()
  if (!last) return setPreview($, x => ({ ...x, status: 'nothing to undo' }))
  const base = saved.get(p.path)
  const isSaved = base !== undefined && sameLines(base, last.lines)
  await setPreview($, x => {
    const rows = Math.max(1, hasNoteRow(x) ? room - 1 : room)
    const top = last.row < x.top || last.row >= x.top + rows ? Math.max(0, last.row - Math.floor(rows / 2)) : x.top
    return { ...x, ...last, top, dirty: !isSaved, status: null, confirm: null }
  })
}

/** One key, a click on the mode label, or a click in the text, while editing. */
export async function editMessage($: EngineInterface, p: Preview, d: UiMessage, room: number) {
  if (d.k === 'mode' || d.k === 'crumb') return leaveEdit($)
  if (d.k === 'place' && typeof d.row === 'number' && typeof d.vis === 'number') {
    const row = Math.min(p.top + d.row, Math.max(0, p.lines.length - 1))
    const col = colFromVisual(p.lines[row] ?? '', Math.max(0, d.vis))
    return setPreview($, x => ({ ...x, row, col, confirm: null }))
  }
  if (d.k !== 'key' || typeof d.key !== 'string') return
  const r = reduceEdit(p, toKey(d), room)
  if (r.effect === 'save') return saveFile($)
  if (r.effect === 'exit') return leaveEdit($)
  if (r.effect === 'undo') return undoEdit($, room)
  if (r.changed) {
    const steps = history.get(p.path) ?? []
    steps.push({ lines: p.lines, row: p.row, col: p.col })
    if (steps.length > MAX_UNDO) steps.shift()
    history.set(p.path, steps)
  }
  if (r.p !== p) await setPreview($, () => r.p)
}
