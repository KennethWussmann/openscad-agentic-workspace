import { existsSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import type { BBox, DefineValue, Diagnostic, PartDef, PartResult, Vec3 } from '@scad/protocol'
import type { ProjectConfig } from '../config/schema.ts'
import { readJson } from '../fs/json.ts'
import { parseDiagnostics } from '../openscad/diagnostics.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { baseArgs, defineArgs, parseDepsFile, runOpenscad } from '../openscad/run.ts'
import { type ActiveSet, effectiveDefines } from '../sets/sets.ts'
import { type Paths, toPosix } from '../workspace/paths.ts'

type Summary = {
  geometry?: { bounding_box?: { min: Vec3; max: Vec3; size: Vec3 }; facets?: number; vertices?: number }
}

const toBBox = (summary: Summary | null): BBox | null => {
  const box = summary?.geometry?.bounding_box
  return box ? { min: box.min, max: box.max, size: box.size } : null
}

const TWO_D_HINT =
  'This part is 2D. Previews need 3D geometry: extrude it for the preview, and add a separate 2D part with `preview: false` in config.yaml for svg/dxf export.'

export const emptyPart = (part: PartDef, diagnostics: Diagnostic[] = []): PartResult => ({
  id: part.id,
  label: part.label,
  file: part.file,
  status: 'error',
  model: null,
  stale: false,
  bbox: null,
  facets: null,
  vertices: null,
  durationMs: 0,
  diagnostics,
})

export type PartContext = {
  paths: Paths
  openscad: Openscad
  config: ProjectConfig
  dir: string
  work: string
  outDir: string
  set: ActiveSet | null
  overrides: Record<string, DefineValue>
  deps: Set<string>
}

export const renderPart = async (ctx: PartContext, part: PartDef, previous: PartResult | undefined) => {
  const { paths, config, dir, work, deps } = ctx
  const abs = path.resolve(dir, part.file)
  const keepPrevious = (result: PartResult): PartResult =>
    previous?.model && existsSync(path.join(dir, previous.model))
      ? {
          ...result,
          model: previous.model,
          bbox: previous.bbox,
          facets: previous.facets,
          vertices: previous.vertices,
          stale: true,
        }
      : result
  if (!existsSync(abs))
    return keepPrevious(emptyPart(part, [{ level: 'error', message: `File not found: ${part.file}` }]))
  deps.add(abs)
  const tmpModel = path.join(work, `${part.id}.3mf`)
  const summaryFile = path.join(work, `${part.id}.summary.json`)
  const depsFile = path.join(work, `${part.id}.deps`)
  const defines = effectiveDefines(config.settings, ctx.set, ctx.overrides, part)
  const run = await runOpenscad({
    command: ctx.openscad.command,
    args: [
      ...baseArgs(config.settings),
      '-o',
      tmpModel,
      '--summary',
      'all',
      '--summary-file',
      summaryFile,
      '-d',
      depsFile,
      ...defineArgs(defines),
      abs,
    ],
    cwd: dir,
    paths,
    settings: config.settings,
  })
  if (existsSync(depsFile))
    for (const d of parseDepsFile(readFileSync(depsFile, 'utf8'))) deps.add(path.resolve(dir, d))
  const ok = run.code === 0 && existsSync(tmpModel)
  const diagnostics = parseDiagnostics(run.stderr, ok)
  if (diagnostics.some((d) => /not a 3D object/.test(d.message)))
    diagnostics.push({ level: 'error', message: TWO_D_HINT })
  if (!ok) return keepPrevious({ ...emptyPart(part, diagnostics), durationMs: run.durationMs })
  const target = path.join(ctx.outDir, `${part.id}.3mf`)
  renameSync(tmpModel, target)
  const summary = readJson<Summary>(summaryFile)
  return {
    ...emptyPart(part, diagnostics),
    status: 'ok',
    model: toPosix(path.relative(dir, target)),
    bbox: toBBox(summary),
    facets: summary?.geometry?.facets ?? null,
    vertices: summary?.geometry?.vertices ?? null,
    durationMs: run.durationMs,
  } satisfies PartResult
}
