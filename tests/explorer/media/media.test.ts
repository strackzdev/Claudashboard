import { expect, test } from 'claude-code/testing'

import { fitPicture, fromBase64, kindOf, markdownWindow, pngSize } from '../../../hooks/explorer/media/media'

test('files show by kind: markdown, pictures, the rest as code', () => {
  expect(kindOf('README.md')).toBe('markdown')
  expect(kindOf('docs/a.MDX')).toBe('markdown')
  expect(kindOf('shot.png')).toBe('image')
  expect(kindOf('photo.JPEG')).toBe('image')
  expect(kindOf('a.ts')).toBe('text')
})

test('a markdown window that starts inside a code fence reopens it', () => {
  const lines = ['# Title', '```ts', 'const a = 1', 'const b = 2', '```', 'after']
  expect(markdownWindow(lines, 0, 2)).toBe('# Title\n```ts')
  expect(markdownWindow(lines, 3, 3)).toBe('```\nconst b = 2\n```\nafter')
  expect(markdownWindow(lines, 5, 3)).toBe('after')
})

test("a PNG's size comes from its header; pictures keep their proportions", () => {
  // The first 24 bytes of a 640×480 PNG.
  const head = 'iVBORw0KGgoAAAANSUhEUgAAAoAAAAHg'
  expect(pngSize(fromBase64(head))).toEqual({ width: 640, height: 480 })
  expect(pngSize(fromBase64('aGVsbG8gd29ybGQgaGVsbG8gd29ybGQ='))).toBe(null)
  // 640×480 in 76×20 cells: 4:3 with cells twice as tall as wide.
  const fit = fitPicture(640, 480, 76, 20)
  expect(fit.rows).toBeLessThanOrEqual(20)
  expect(fit.columns).toBeLessThanOrEqual(76)
  expect(Math.abs(fit.rows / fit.columns - 480 / 640 / 2)).toBeLessThan(0.05)
  // A tiny picture is not blown up past ~8 pixels a cell.
  expect(fitPicture(16, 16, 76, 20).columns).toBe(2)
})
