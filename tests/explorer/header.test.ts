import { expect, test } from 'claude-code/testing'

import { clipMiddle } from '../../hooks/shared/format'
import { fitCrumbs, fitHeader } from '../../hooks/explorer/header'

const used = (h: ReturnType<typeof fitHeader>, filter: string | null) =>
  h.crumbs.reduce((n, p) => n + p.length, 0) +
  3 * Math.max(0, h.crumbs.length - 1) +
  (filter === null ? 0 : filter.length + 4) +
  (h.label?.length ?? 0) +
  (h.hint ? h.hint.key.length + 1 + h.hint.label.length + 2 : 0) +
  (h.dirty ? h.dirty.length + 2 : 0)

test('the breadcrumb folds its middle first, then cuts the name from the middle', () => {
  const path = ['strackz', 'Smile', 'cloe-elec-data-sync', 'CODEOWNERS']
  expect(fitCrumbs(path, 80)).toEqual(path)
  expect(fitCrumbs(path, 46)).toEqual(['strackz', '…', 'cloe-elec-data-sync', 'CODEOWNERS'])
  expect(fitCrumbs(path, 40)).toEqual(['strackz', '…', 'CODEOWNERS'])
  expect(fitCrumbs(path, 24)).toEqual(['strackz', '…', 'CODEOWNERS'])
  expect(fitCrumbs(path, 14)).toEqual(['…', 'CODEOWNERS'])
  expect(fitCrumbs(path, 6)).toEqual(['COD…RS'])
  expect(clipMiddle('presentation.ar.html', 12)).toBe('presen….html')
})

test('the file box header fits every width, and the mode label never leaves', () => {
  const path = ['strackz', 'Smile', 'cloe-elec-data-sync', 'CODEOWNERS']
  for (let width = 20; width <= 120; width++) {
    for (const mode of ['view', 'edit', 'readonly', null] as const) {
      for (const isDirty of [false, true]) {
        const h = fitHeader({ width, crumbs: path, filter: null, mode, isDirty })
        expect(used(h, null) <= width).toBe(true)
        if (mode) expect(h.label).not.toBe(null)
      }
    }
    const listed = fitHeader({ width, crumbs: path, filter: 'abc▏', mode: null, isDirty: false })
    expect(used(listed, 'abc▏') <= width || width < 24).toBe(true)
  }
  // Wide: everything shows. Narrow: the short label, extras gone.
  const wide = fitHeader({ width: 100, crumbs: path, filter: null, mode: 'view', isDirty: false })
  expect(wide.label).toBe(' VIEW MODE ')
  expect(wide.hint?.key).toBe('e')
  const narrow = fitHeader({ width: 30, crumbs: path, filter: null, mode: 'edit', isDirty: true })
  expect(narrow.label).toBe(' EDIT ')
})
