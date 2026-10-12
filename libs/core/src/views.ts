import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import type { Settings } from './config.ts'
import type { Openscad } from './discovery.ts'
import { parseDiagnostics, runOpenscad } from './openscad.ts'
import type { Paths } from './paths.ts'
import type { BBox, Diagnostic, Vec3 } from './protocol.ts'
import { concurrency } from './render.ts'

export const VIEWS = {
  iso: [55, 0, 25],
  front: [90, 0, 0],
  back: [90, 0, 180],
  right: [90, 0, 90],
  left: [90, 0, 270],
  top: [0, 0, 0],
  bottom: [180, 0, 0],
  'iso-back': [55, 0, 205],
} as const satisfies Record<string, Vec3>

export type ViewName = keyof typeof VIEWS

export const SHEET_LAYOUT: ViewName[] = ['iso', 'front', 'right', 'top']

export type Section = {
  axis: 'x' | 'y' | 'z'
  at: number
  keep: 'below' | 'above'
}

export type ViewContext = {
  paths: Paths
  settings: Settings
  openscad: Openscad
  cwd: string
  temp: string
}

const scadString = (p: string) => JSON.stringify(p.replace(/\\/g, '/'))

export const wrapperSource = (models: string[], section: Section | null, bbox: BBox | null) => {
  const imports = models.map((m) => `  import(${scadString(m)});`).join('\n')
  if (!section) return `union() {\n${imports}\n}\n`
  const extent = bbox ? Math.max(...bbox.size.map(Math.abs), 1) : 1000
  const big = Math.ceil(extent * 10 + 1000)
  const index = { x: 0, y: 1, z: 2 }[section.axis]
  const offset: Vec3 = [-big / 2, -big / 2, -big / 2]
  if (bbox) for (let i = 0; i < 3; i++) offset[i] = (bbox.min[i] + bbox.max[i]) / 2 - big / 2
  offset[index] = section.keep === 'below' ? section.at : section.at - big
  return `difference() {\n  union() {\n${imports.replace(/^/gm, '  ')}\n  }\n  translate([${offset.join(', ')}]) cube([${big}, ${big}, ${big}]);\n}\n`
}

export const sectionView = (section: Section): Vec3 => {
  const sign = section.keep === 'below' ? 1 : -1
  if (section.axis === 'x') return [70, 0, sign > 0 ? 70 : 250]
  if (section.axis === 'y') return [70, 0, sign > 0 ? 160 : 340]
  return sign > 0 ? [35, 0, 25] : [145, 0, 25]
}

export type RenderViewOptions = {
  models: string[]
  rotation: Vec3
  width: number
  height: number
  out: string
  section?: Section | null
  bbox?: BBox | null
  axes?: boolean
}

export const renderView = async (ctx: ViewContext, opts: RenderViewOptions): Promise<Diagnostic[]> => {
  const missing = opts.models.filter((m) => !existsSync(m))
  if (missing.length) return [{ level: 'error', message: `Missing model(s): ${missing.join(', ')}. Render first.` }]
  mkdirSync(ctx.temp, { recursive: true })
  const wrapper = path.join(ctx.temp, `view-${randomBytes(4).toString('hex')}.scad`)
  writeFileSync(wrapper, wrapperSource(opts.models, opts.section ?? null, opts.bbox ?? null))
  mkdirSync(path.dirname(opts.out), { recursive: true })
  try {
    const run = await runOpenscad({
      command: ctx.openscad.command,
      args: [
        '-o',
        opts.out,
        `--imgsize=${opts.width},${opts.height}`,
        '--viewall',
        '--autocenter',
        '--projection=o',
        `--camera=0,0,0,${opts.rotation.join(',')},100`,
        `--colorscheme=${ctx.settings.render.colorscheme}`,
        ...(opts.section ? ['--render=1'] : []),
        ...(opts.axes ? ['--view=axes,scales'] : []),
        wrapper,
      ],
      cwd: ctx.cwd,
      paths: ctx.paths,
      settings: ctx.settings,
    })
    const ok = run.code === 0 && existsSync(opts.out)
    return parseDiagnostics(run.stderr, ok).filter((d) => d.level === 'error' || d.level === 'warning')
  } finally {
    rmSync(wrapper, { force: true })
  }
}

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
    const files = SHEET_LAYOUT.map((view) => path.join(dir, `${view}.png`))
    const diagnostics: Diagnostic[] = []
    const queue = SHEET_LAYOUT.map((view, i) => ({ view, file: files[i] }))
    const limit = Math.max(2, concurrency())
    let next = 0
    await Promise.all(
      Array.from({ length: limit }, async () => {
        while (next < queue.length) {
          const job = queue[next++]
          diagnostics.push(
            ...(await renderView(ctx, {
              models,
              rotation: [...VIEWS[job.view]],
              width: tile,
              height: tile,
              out: job.file,
              axes: job.view !== 'iso',
            })),
          )
        }
      }),
    )
    if (files.some((f) => !existsSync(f))) return diagnostics
    const tiles = files.map((f) => PNG.sync.read(readFileSync(f)))
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, composeGrid(tiles, 2, tile, [12, 16, 22]))
    return diagnostics
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
