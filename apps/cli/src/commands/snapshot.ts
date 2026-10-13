import { randomBytes } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import {
  type Focus,
  modelOutlines,
  parseDefineInput,
  readRender,
  renderTemporary,
  renderView,
  requireProject,
  resolveOpenscad,
  type Section,
  sectionView,
  VIEWS,
  type ViewName,
} from '@scad/core'
import { unionBoxes } from '@scad/geometry'
import type { DefineValue, PartResult, Vec3 } from '@scad/protocol'
import { type Ctx, need, type Outcome, partsFlag, rel, settingsFor, UsageError } from '../context.ts'
import { formatDiagnostic } from '../format/common.ts'

const parseSection = (raw: string): Section => {
  const m = raw.match(/^([xyz])\s*=\s*(-?\d+(?:\.\d+)?)(?::(below|above))?$/i)
  if (!m) throw new UsageError('--section expects axis=value[:below|above], e.g. x=10 or z=5:above')
  return { axis: m[1].toLowerCase() as Section['axis'], at: Number(m[2]), keep: (m[3] as Section['keep']) ?? 'below' }
}

const DEFAULT_FOCUS_RADIUS = 5

const parseFocus = (raw: string): Focus => {
  const [point, radius] = raw.split(':')
  const center = point.split(',').map((v) => Number(v.trim()))
  const r = radius === undefined ? DEFAULT_FOCUS_RADIUS : Number(radius)
  if (center.length !== 3 || center.some((v) => !Number.isFinite(v)) || !(r > 0))
    throw new UsageError('--focus expects x,y,z[:radius], e.g. 20.5,32.8,3.7 or 20.5,32.8,3.7:8')
  return { center: center as Vec3, radius: r }
}

const parseDefines = (raw: string[] = []) =>
  Object.fromEntries(
    raw.map((entry) => {
      const m = entry.match(/^\s*(\$?[A-Za-z_]\w*)\s*=(.*)$/)
      if (!m) throw new UsageError('-D expects name=value, e.g. -D part=assembly or -D width=40')
      return [m[1], parseDefineInput(m[2])]
    }),
  ) as Record<string, DefineValue>

const renderedParts = async (ctx: Ctx, project: string, dir: string, defines: Record<string, DefineValue>) => {
  const parts = partsFlag(ctx.flags)
  if (Object.keys(defines).length) {
    const openscad = await resolveOpenscad(ctx.paths)
    return renderTemporary({ paths: ctx.paths, project, openscad, defines, outDir: dir, parts })
  }
  const result = readRender(ctx.paths, project)
  if (!result) throw new Error(`Render ${project} first`)
  return result.parts.filter((p) => !parts || parts.includes(p.id))
}

const failure = (parts: PartResult[]) =>
  ['Render with -D failed', ...parts.flatMap((p) => p.diagnostics.map((d) => `  ${formatDiagnostic(d)}`))].join('\n')

export const snapshot = async (ctx: Ctx): Promise<Outcome> => {
  const { paths, flags, args } = ctx
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const defines = parseDefines(flags.define)
  const defined = Object.keys(defines).length > 0
  const section = flags.section ? parseSection(flags.section) : null
  const focus = flags.focus ? parseFocus(flags.focus) : null
  if (flags.view && !(flags.view in VIEWS))
    throw new UsageError(`--view must be one of ${Object.keys(VIEWS).join(', ')}`)
  const rotation: Vec3 = flags.view
    ? [...VIEWS[flags.view as ViewName]]
    : section
      ? sectionView(section)
      : [...VIEWS.iso]
  const size = Number(flags.size ?? 900)
  const name =
    flags.out ??
    `snapshot-${flags.view ?? 'auto'}${section ? `-${section.axis}${section.at}-${section.keep}` : ''}${focus ? `-at${focus.center.join('_')}` : ''}${defined ? '-defined' : ''}.png`
  const out = path.join(layout.preview, path.basename(name))
  const work = path.join(layout.temp, `snapshot-${randomBytes(4).toString('hex')}`)
  try {
    const rendered = await renderedParts(ctx, project, work, defines)
    const selected = rendered.filter((p) => p.model)
    if (defined && selected.length < rendered.length) throw new Error(failure(rendered.filter((p) => !p.model)))
    if (!selected.length) throw new Error('No rendered parts match')
    const settings = settingsFor(paths, project)
    const openscad = await resolveOpenscad(paths)
    const bbox = unionBoxes(selected.map((p) => p.bbox).filter((b) => b !== null))
    const models = selected.map((p) => path.join(layout.dir, p.model as string))
    const diagnostics = await renderView(
      { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
      {
        models,
        rotation,
        width: size,
        height: size,
        out,
        section,
        bbox,
        focus,
        outlines: section || focus ? null : modelOutlines(models),
        axes: true,
      },
    )
    const ok = existsSync(out) && !diagnostics.some((d) => d.level === 'error')
    return {
      data: { file: rel(paths, out), ok, defines, diagnostics },
      text: [ok ? `Wrote ${rel(paths, out)}` : 'Snapshot failed', ...diagnostics.map(formatDiagnostic)].join('\n'),
      exitCode: ok ? 0 : 1,
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
