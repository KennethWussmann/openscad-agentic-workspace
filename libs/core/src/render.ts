import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadProjectConfig, type ProjectConfig } from './config.ts'
import type { Openscad } from './discovery.ts'
import { syncLibraries } from './libraries.ts'
import { baseArgs, defineArgs, parseDepsFile, parseDiagnostics, runOpenscad } from './openscad.ts'
import { mergeParams, parseParamExport } from './params.ts'
import { type Paths, projectLayout, toPosix } from './paths.ts'
import type { BBox, DefineValue, Diagnostic, InputFile, ParamDef, PartResult, RenderResult, Vec3 } from './protocol.ts'

export type RenderKind = 'preview' | 'tweak'

export type RenderOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  kind?: RenderKind
  overrides?: Record<string, DefineValue>
  parts?: string[]
}

export const sha1 = (file: string) => createHash('sha1').update(readFileSync(file)).digest('hex')

export const writeJsonAtomic = (file: string, data: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, file)
}

export const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export const renderDir = (paths: Paths, project: string, kind: RenderKind) => {
  const layout = projectLayout(paths, project)
  return kind === 'preview' ? layout.preview : layout.tweak
}

export const readRender = (paths: Paths, project: string, kind: RenderKind = 'preview') =>
  readJson<RenderResult>(path.join(renderDir(paths, project, kind), 'render.json'))

const pool = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export const concurrency = () => Math.max(1, Math.min(4, Math.floor(os.availableParallelism() / 2)))

type Summary = {
  geometry?: { bounding_box?: { min: Vec3; max: Vec3; size: Vec3 }; facets?: number; vertices?: number }
}

const toBBox = (summary: Summary | null): BBox | null => {
  const box = summary?.geometry?.bounding_box
  return box ? { min: box.min, max: box.max, size: box.size } : null
}

const inputEntry = (paths: Paths, file: string): InputFile | null =>
  existsSync(file) ? { path: toPosix(path.relative(paths.workspace, file)), sha: sha1(file) } : null

export const inputsChanged = (paths: Paths, inputs: InputFile[]) =>
  inputs.filter((input) => {
    const file = path.join(paths.workspace, input.path)
    return !existsSync(file) || sha1(file) !== input.sha
  })

const extractParams = async (
  opts: RenderOptions,
  config: ProjectConfig,
  dir: string,
  work: string,
): Promise<{ params: ParamDef[]; diagnostics: Diagnostic[] }> => {
  const files = [...new Set(config.meta.parts.map((p) => p.file))]
  const hidden = new Set(config.meta.parts.flatMap((p) => Object.keys(p.defines)))
  const diagnostics: Diagnostic[] = []
  const lists = await pool(files, concurrency(), async (file, i = files.indexOf(file)) => {
    const abs = path.resolve(dir, file)
    if (!existsSync(abs)) return []
    const out = path.join(work, `params-${i}.json`)
    const run = await runOpenscad({
      command: opts.openscad.command,
      args: ['--export-format', 'param', '-o', out, abs],
      cwd: dir,
      paths: opts.paths,
      settings: config.settings,
    })
    if (run.code !== 0 || !existsSync(out)) return []
    try {
      return parseParamExport(readFileSync(out, 'utf8'))
    } catch (e) {
      diagnostics.push({ level: 'warning', message: `Could not read parameters of ${file}: ${String(e)}` })
      return []
    }
  })
  return { params: mergeParams(lists, hidden), diagnostics }
}

export const renderProject = async (opts: RenderOptions): Promise<RenderResult> => {
  const { paths, project } = opts
  const kind = opts.kind ?? 'preview'
  const layout = projectLayout(paths, project)
  if (!existsSync(layout.dir)) throw new Error(`Project "${project}" does not exist in ${paths.workspace}`)
  const config = loadProjectConfig(paths, layout.config, project)
  const outDir = renderDir(paths, project, kind)
  const previous = readRender(paths, project, kind)
  const overrides = opts.overrides ?? {}
  const work = path.join(layout.temp, `render-${randomBytes(4).toString('hex')}`)
  mkdirSync(work, { recursive: true })
  mkdirSync(outDir, { recursive: true })
  const startedAt = new Date()
  await syncLibraries(paths, config.settings)
  const deps = new Set<string>()
  try {
    const previewable = config.meta.parts.filter((p) => p.preview)
    const selected = previewable.filter((p) => !opts.parts || opts.parts.includes(p.id))
    const unknown = (opts.parts ?? []).filter((id) => !config.meta.parts.some((p) => p.id === id))
    if (unknown.length) throw new Error(`Unknown part(s): ${unknown.join(', ')}`)
    const paramsTask = extractParams(opts, config, layout.dir, work)
    const rendered = await pool(selected, concurrency(), async (part): Promise<PartResult> => {
      const abs = path.resolve(layout.dir, part.file)
      const base: PartResult = {
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
        diagnostics: [],
      }
      const prev = previous?.parts.find((p) => p.id === part.id)
      const keepPrevious = (result: PartResult): PartResult =>
        prev?.model && existsSync(path.join(layout.dir, prev.model))
          ? { ...result, model: prev.model, bbox: prev.bbox, facets: prev.facets, vertices: prev.vertices, stale: true }
          : result
      if (!existsSync(abs)) {
        return keepPrevious({ ...base, diagnostics: [{ level: 'error', message: `File not found: ${part.file}` }] })
      }
      deps.add(abs)
      const tmpModel = path.join(work, `${part.id}.3mf`)
      const summaryFile = path.join(work, `${part.id}.summary.json`)
      const depsFile = path.join(work, `${part.id}.deps`)
      const defines = { ...config.settings.render.defines, ...overrides, ...part.defines }
      const run = await runOpenscad({
        command: opts.openscad.command,
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
        cwd: layout.dir,
        paths,
        settings: config.settings,
      })
      if (existsSync(depsFile))
        for (const d of parseDepsFile(readFileSync(depsFile, 'utf8'))) deps.add(path.resolve(layout.dir, d))
      const ok = run.code === 0 && existsSync(tmpModel)
      const diagnostics = parseDiagnostics(run.stderr, ok)
      if (diagnostics.some((d) => /not a 3D object/.test(d.message)))
        diagnostics.push({
          level: 'error',
          message:
            'This part is 2D. Previews need 3D geometry: extrude it for the preview, and add a separate 2D part with `preview: false` in config.yaml for svg/dxf export.',
        })
      if (!ok) return keepPrevious({ ...base, durationMs: run.durationMs, diagnostics })
      const target = path.join(outDir, `${part.id}.3mf`)
      renameSync(tmpModel, target)
      const summary = readJson<Summary>(summaryFile)
      return {
        ...base,
        status: 'ok',
        model: toPosix(path.relative(layout.dir, target)),
        bbox: toBBox(summary),
        facets: summary?.geometry?.facets ?? null,
        vertices: summary?.geometry?.vertices ?? null,
        durationMs: run.durationMs,
        diagnostics,
      }
    })
    const parts = previewable.map(
      (p) =>
        rendered.find((r) => r.id === p.id) ??
        previous?.parts.find((r) => r.id === p.id) ?? {
          id: p.id,
          label: p.label,
          file: p.file,
          status: 'error' as const,
          model: null,
          stale: false,
          bbox: null,
          facets: null,
          vertices: null,
          durationMs: 0,
          diagnostics: [{ level: 'error' as const, message: 'Not rendered yet' }],
        },
    )
    const { params, diagnostics: paramDiagnostics } = await paramsTask
    if (paramDiagnostics.length && parts[0]) parts[0].diagnostics.push(...paramDiagnostics)
    if (existsSync(layout.config)) deps.add(layout.config)
    if (opts.parts && previous) for (const input of previous.inputs) deps.add(path.join(paths.workspace, input.path))
    const inputs = [...deps]
      .map((d) => inputEntry(paths, d))
      .filter((i): i is InputFile => i !== null)
      .sort((a, b) => a.path.localeCompare(b.path))
    const finishedAt = new Date()
    const result: RenderResult = {
      project,
      status: parts.every((p) => p.status === 'ok') ? 'ok' : 'error',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      overrides,
      parts,
      params,
      inputs,
    }
    writeJsonAtomic(path.join(outDir, 'render.json'), result)
    return result
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export const isRenderCurrent = (paths: Paths, render: RenderResult | null) =>
  render !== null && render.status === 'ok' && inputsChanged(paths, render.inputs).length === 0
