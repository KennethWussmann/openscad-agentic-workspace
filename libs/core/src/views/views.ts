import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { BBox, Diagnostic, Vec3 } from '@scad/protocol'
import type { Settings } from '../config/schema.ts'
import { parseDiagnostics } from '../openscad/diagnostics.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { runOpenscad } from '../openscad/run.ts'
import type { Paths } from '../workspace/paths.ts'

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

export type Focus = {
  center: Vec3
  radius: number
}

export type WrapperOptions = {
  section?: Section | null
  bbox?: BBox | null
  focus?: Focus | null
}

const indent = (src: string) => src.replace(/^/gm, '  ')

const sectionSource = (body: string, section: Section, bbox: BBox | null) => {
  const extent = bbox ? Math.max(...bbox.size.map(Math.abs), 1) : 1000
  const big = Math.ceil(extent * 10 + 1000)
  const index = { x: 0, y: 1, z: 2 }[section.axis]
  const offset: Vec3 = [-big / 2, -big / 2, -big / 2]
  if (bbox) for (let i = 0; i < 3; i++) offset[i] = (bbox.min[i] + bbox.max[i]) / 2 - big / 2
  offset[index] = section.keep === 'below' ? section.at : section.at - big
  return `difference() {\n${indent(body)}\n  translate([${offset.join(', ')}]) cube([${big}, ${big}, ${big}]);\n}`
}

const focusSource = (body: string, { center, radius }: Focus) =>
  `intersection() {\n${indent(body)}\n  translate([${center.map((c) => c - radius).join(', ')}]) cube(${2 * radius});\n}`

export const wrapperSource = (models: string[], { section = null, bbox = null, focus = null }: WrapperOptions = {}) => {
  let body = `union() {\n${models.map((m) => `  import(${scadString(m)});`).join('\n')}\n}`
  if (section) body = sectionSource(body, section, bbox)
  if (focus) body = focusSource(body, focus)
  return `${body}\n`
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
  focus?: Focus | null
  axes?: boolean
}

export const renderView = async (ctx: ViewContext, opts: RenderViewOptions): Promise<Diagnostic[]> => {
  const missing = opts.models.filter((m) => !existsSync(m))
  if (missing.length) return [{ level: 'error', message: `Missing model(s): ${missing.join(', ')}. Render first.` }]
  mkdirSync(ctx.temp, { recursive: true })
  const wrapper = path.join(ctx.temp, `view-${randomBytes(4).toString('hex')}.scad`)
  writeFileSync(wrapper, wrapperSource(opts.models, opts))
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
        ...(opts.section || opts.focus ? ['--render=1'] : []),
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
