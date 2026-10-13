import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  type Focus,
  readRender,
  renderView,
  requireProject,
  resolveOpenscad,
  type Section,
  sectionView,
  VIEWS,
  type ViewName,
} from '@scad/core'
import { unionBoxes } from '@scad/geometry'
import type { Vec3 } from '@scad/protocol'
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

export const snapshot = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const result = readRender(paths, project)
  if (!result) throw new Error(`Render ${project} first`)
  const parts = partsFlag(flags)
  const selected = result.parts.filter((p) => p.model && (!parts || parts.includes(p.id)))
  if (!selected.length) throw new Error('No rendered parts match')
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
    `snapshot-${flags.view ?? 'auto'}${section ? `-${section.axis}${section.at}-${section.keep}` : ''}${focus ? `-at${focus.center.join('_')}` : ''}.png`
  const out = path.join(layout.preview, path.basename(name))
  const settings = settingsFor(paths, project)
  const openscad = await resolveOpenscad(paths)
  const bbox = unionBoxes(selected.map((p) => p.bbox).filter((b) => b !== null))
  const diagnostics = await renderView(
    { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
    {
      models: selected.map((p) => path.join(layout.dir, p.model as string)),
      rotation,
      width: size,
      height: size,
      out,
      section,
      bbox,
      focus,
      axes: true,
    },
  )
  const ok = existsSync(out) && !diagnostics.some((d) => d.level === 'error')
  return {
    data: { file: rel(paths, out), ok, diagnostics },
    text: [ok ? `Wrote ${rel(paths, out)}` : 'Snapshot failed', ...diagnostics.map(formatDiagnostic)].join('\n'),
    exitCode: ok ? 0 : 1,
  }
}
