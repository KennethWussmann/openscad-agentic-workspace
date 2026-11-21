import { existsSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import type { AssemblyDef, AssemblyPart, AssemblyResult, BBox, Vec3 } from '@scad/protocol'
import type { ProjectConfig } from '../config/schema.ts'
import { readJson } from '../fs/json.ts'
import { parseDiagnostics } from '../openscad/diagnostics.ts'
import { baseArgs, defineArgs, runOpenscad } from '../openscad/run.ts'
import { effectiveDefines } from '../sets/sets.ts'
import type { PartContext } from './part.ts'
import { concurrency, pool } from './pool.ts'

export const ASSEMBLY_PART_DEFINE = 'assembly_part'

const EMPTY_RE = /^Current top level object is empty/

type Summary = {
  geometry?: { bounding_box?: { min: Vec3; max: Vec3; size: Vec3 }; facets?: number; vertices?: number }
}

const toBBox = (summary: Summary | null): BBox | null => {
  const box = summary?.geometry?.bounding_box
  return box ? { min: box.min, max: box.max, size: box.size } : null
}

const unionBox = (boxes: (BBox | null)[]): BBox | null => {
  const real = boxes.filter((b): b is BBox => b !== null)
  if (!real.length) return null
  const min = [0, 1, 2].map((k) => Math.min(...real.map((b) => b.min[k]))) as Vec3
  const max = [0, 1, 2].map((k) => Math.max(...real.map((b) => b.max[k]))) as Vec3
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}

const EMPTY_HINT =
  'The assembly produced no geometry. Check its defines (the part selector) and the assembly_part branches in the source.'

const emptyPart = (config: ProjectConfig, partId: string): AssemblyPart => ({
  id: partId,
  label: config.meta.parts.find((p) => p.id === partId)?.label,
  model: null,
  stale: false,
  bbox: null,
  facets: null,
  vertices: null,
  durationMs: 0,
  diagnostics: [],
})

const renderAssemblyPart = async (
  ctx: PartContext,
  assembly: AssemblyDef,
  partId: string,
  outDir: string,
): Promise<AssemblyPart | null> => {
  const { paths, config, dir, work, set, overrides } = ctx
  const abs = path.resolve(dir, assembly.file)
  if (!existsSync(abs)) return null
  const tmpModel = path.join(work, `${assembly.id}-${partId}.3mf`)
  const summaryFile = path.join(work, `${assembly.id}-${partId}.summary.json`)
  const defines = {
    ...effectiveDefines(config.settings, set, overrides, assembly),
    [ASSEMBLY_PART_DEFINE]: partId,
  }
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
      ...defineArgs(defines),
      abs,
    ],
    cwd: dir,
    paths,
    settings: config.settings,
  })
  const ok = run.code === 0 && existsSync(tmpModel)
  const diagnostics = parseDiagnostics(run.stderr, ok)
  if (!ok) {
    if (diagnostics.length === 1 && EMPTY_RE.test(diagnostics[0].message)) return null
    return { ...emptyPart(config, partId), durationMs: run.durationMs, diagnostics }
  }
  const summary = readJson<Summary>(summaryFile)
  if (!summary?.geometry?.facets) return null
  const target = path.join(outDir, `${partId}.3mf`)
  mkdirSync(outDir, { recursive: true })
  renameSync(tmpModel, target)
  return {
    ...emptyPart(config, partId),
    model: path.relative(dir, target).split(path.sep).join('/'),
    bbox: toBBox(summary),
    facets: summary.geometry.facets,
    vertices: summary.geometry.vertices ?? null,
    durationMs: run.durationMs,
  }
}

export const renderAssembly = async (
  ctx: PartContext,
  assembly: AssemblyDef,
  partIds: string[],
  outDir: string,
  previous?: AssemblyResult,
): Promise<AssemblyResult> => {
  const results = await pool(partIds, concurrency(), async (partId) => {
    const fresh = await renderAssemblyPart(ctx, assembly, partId, outDir)
    if (fresh === null) return null
    if (!fresh.model) {
      const old = previous?.parts.find((p) => p.id === partId)
      if (old?.model && existsSync(path.join(ctx.dir, old.model)))
        return {
          ...fresh,
          model: old.model,
          bbox: old.bbox,
          facets: old.facets,
          vertices: old.vertices,
          stale: true,
        }
    }
    return fresh
  })
  const parts = results.filter((p): p is AssemblyPart => p !== null)
  const errors = parts.flatMap((p) => p.diagnostics)
  const stale = parts.some((p) => p.stale)
  const result: AssemblyResult = {
    id: assembly.id,
    label: assembly.label,
    file: assembly.file,
    status: 'ok',
    preview: assembly.preview,
    export: assembly.export,
    stale,
    parts,
    bbox: unionBox(parts.map((p) => p.bbox)),
    durationMs: parts.reduce((n, p) => n + p.durationMs, 0),
    diagnostics: [],
  }
  if (errors.length) {
    result.status = 'error'
    result.diagnostics = errors
  } else if (!parts.some((p) => p.model && !p.stale)) {
    result.status = 'error'
    result.diagnostics = [{ level: 'error', message: EMPTY_HINT }]
  }
  return result
}

export const assemblyDir = (base: string, assemblyId: string) => path.join(base, 'assemblies', assemblyId)
