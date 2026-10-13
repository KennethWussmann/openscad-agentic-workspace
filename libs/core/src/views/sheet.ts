import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Diagnostic } from '@scad/protocol'
import { PNG } from 'pngjs'
import { concurrency, pool } from '../render/pool.ts'
import { modelOutlines } from './outline.ts'
import { renderView, VIEWS, type ViewContext, type ViewName } from './views.ts'

export const SHEET_LAYOUT: ViewName[] = ['iso', 'front', 'right', 'top']

const GAP = 4

export const composeGrid = (tiles: PNG[], columns: number, tile: number, background: [number, number, number]) => {
  const rows = Math.ceil(tiles.length / columns)
  const width = columns * tile + (columns - 1) * GAP
  const height = rows * tile + (rows - 1) * GAP
  const out = new PNG({ width, height })
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = background[0]
    out.data[i + 1] = background[1]
    out.data[i + 2] = background[2]
    out.data[i + 3] = 255
  }
  tiles.forEach((img, i) => {
    const x = (i % columns) * (tile + GAP)
    const y = Math.floor(i / columns) * (tile + GAP)
    PNG.bitblt(img, out, 0, 0, Math.min(img.width, tile), Math.min(img.height, tile), x, y)
  })
  return PNG.sync.write(out)
}

export const renderSheet = async (ctx: ViewContext, models: string[], out: string): Promise<Diagnostic[]> => {
  const tile = Math.floor(ctx.settings.render.sheetSize / 2)
  const dir = path.join(ctx.temp, `sheet-${randomBytes(4).toString('hex')}`)
  mkdirSync(dir, { recursive: true })
  try {
    const outlines = modelOutlines(models.filter((m) => existsSync(m)))
    const files = SHEET_LAYOUT.map((view) => path.join(dir, `${view}.png`))
    const results = await pool(SHEET_LAYOUT, Math.max(2, concurrency()), (view) =>
      renderView(ctx, {
        models,
        rotation: [...VIEWS[view]],
        width: tile,
        height: tile,
        out: files[SHEET_LAYOUT.indexOf(view)],
        axes: view !== 'iso',
        outlines,
      }),
    )
    const diagnostics = results.flat()
    if (files.some((f) => !existsSync(f))) return diagnostics
    const tiles = files.map((f) => PNG.sync.read(readFileSync(f)))
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, composeGrid(tiles, 2, tile, [12, 16, 22]))
    return diagnostics
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
