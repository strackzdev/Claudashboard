// Pictures in the preview: a PNG as it is, other formats converted to a PNG first.
import type { EngineInterface } from 'claude-code'
import type { Preview } from '../types'
import { fmtSize } from './format'
import { fromBase64, pngSize } from './media'
import { baseName, toSlash } from './paths'

/** The external tool that turns a JPEG, GIF, WebP or BMP into a PNG, found once: ImageMagick, then ffmpeg. */
let converter: string[] | null | undefined

async function findConverter($: EngineInterface): Promise<string[] | null> {
  if (converter !== undefined) return converter
  for (const argv of [
    ['magick', '-version'],
    ['convert', '-version'],
    ['ffmpeg', '-version'],
  ]) {
    const r = await $.process.run(argv, { timeoutMs: 3000 }).catch(() => null)
    if (r && r.exitCode === 0 && (argv[0] !== 'convert' || r.stdout.includes('ImageMagick'))) {
      converter = argv.slice(0, 1)
      return converter
    }
  }
  converter = null
  return null
}

/** The folder converted pictures go in, under the system's temp folder; made once. */
let cacheDir: string | undefined

async function pictureCache($: EngineInterface): Promise<string> {
  if (cacheDir) return cacheDir
  const tmp = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? (await $.env.get('TMP')) ?? '/tmp'
  const dir = `${toSlash(tmp).replace(/\/+$/, '')}/strackzdevhub-pictures`
  // A write makes the folders it needs, so the converter has somewhere to put its file.
  await $.fs.write(`${dir}/.keep`, '')
  cacheDir = dir
  return dir
}

/**
 * A picture ready for the terminal: a PNG as it is, anything else converted to a PNG under the
 * system's temp folder (keyed by path and mtime, so an edited picture converts again).
 */
export async function loadPicture($: EngineInterface, abs: string, size: number, mtimeMs: number): Promise<Pick<Preview, 'image' | 'note'>> {
  const label = `${baseName(abs)} · ${fmtSize(size)}`
  let png = abs
  if (!/\.png$/i.test(abs)) {
    const tool = await findConverter($)
    if (!tool) return { image: null, note: `${label}: install ImageMagick or ffmpeg to preview this format (PNG shows as is)` }
    const out = `${await pictureCache($)}/${abs.replace(/[^A-Za-z0-9._-]/g, '_')}.${Math.round(mtimeMs)}.png`
    if (!(await $.fs.exists(out))) {
      const argv = tool[0] === 'ffmpeg' ? ['ffmpeg', '-y', '-loglevel', 'error', '-i', abs, '-frames:v', '1', out] : [tool[0] ?? 'magick', `${abs}[0]`, out]
      const r = await $.process.run(argv, { timeoutMs: 20000 }).catch(() => null)
      if (!r || r.exitCode !== 0) return { image: null, note: `${label}: could not convert it to PNG` }
    }
    png = out
  }
  if (size > 4 * 1024 * 1024 && png === abs) return { image: null, note: `${label}: too large to preview` }
  const read = (await $.fs.read(png, { as: 'bytes' })) as { base64: string }
  const dims = pngSize(fromBase64(read.base64.slice(0, 64)))
  if (!dims) return { image: null, note: `${label}: not a readable PNG` }
  return { image: { file: png, ...dims }, note: null }
}
