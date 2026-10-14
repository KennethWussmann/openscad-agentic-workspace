import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { DefineValue, InputFile, RenderKind, RenderResult } from '@scad/protocol'
import { loadProjectConfig } from '../config/load.ts'
import { writeJsonAtomic } from '../fs/json.ts'
import { syncLibraries } from '../libraries/vendor.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { resolveSet, setParts } from '../sets/sets.ts'
import { type Paths, projectLayout } from '../workspace/paths.ts'
import { extractParams } from './params.ts'
import { emptyPart, renderPart } from './part.ts'
import { concurrency, pool } from './pool.ts'
import { inputEntry, readRender, renderDir } from './store.ts'

export type RenderOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  kind?: RenderKind
  overrides?: Record<string, DefineValue>
  parts?: string[]
  set?: string | null
}

export const renderProject = async (opts: RenderOptions): Promise<RenderResult> => {
  const { paths, project, openscad } = opts
  const kind = opts.kind ?? 'preview'
  const layout = projectLayout(paths, project)
  if (!existsSync(layout.dir)) throw new Error(`Project "${project}" does not exist in ${paths.workspace}`)
  const config = loadProjectConfig(paths, layout.config, project)
  const set = resolveSet(config.meta, opts.set)
  const outDir = renderDir(paths, project, kind, set?.name)
  const previous = readRender(paths, project, kind, set?.name)
  const overrides = opts.overrides ?? {}
  const work = path.join(layout.temp, `render-${randomBytes(4).toString('hex')}`)
  mkdirSync(work, { recursive: true })
  mkdirSync(outDir, { recursive: true })
  const startedAt = new Date()
  await syncLibraries(paths, config.settings)
  const deps = new Set<string>()
  try {
    const previewable = setParts(
      config.meta.parts.filter((p) => p.preview),
      set,
    )
    const selected = previewable.filter((p) => !opts.parts || opts.parts.includes(p.id))
    const unknown = (opts.parts ?? []).filter((id) => !config.meta.parts.some((p) => p.id === id))
    if (unknown.length) throw new Error(`Unknown part(s): ${unknown.join(', ')}`)
    const paramsTask = extractParams({ paths, openscad, config, dir: layout.dir, work })
    const ctx = { paths, openscad, config, dir: layout.dir, work, outDir, set, overrides, deps }
    const rendered = await pool(selected, concurrency(), (part) =>
      renderPart(
        ctx,
        part,
        previous?.parts.find((p) => p.id === part.id),
      ),
    )
    const parts = previewable.map(
      (p) =>
        rendered.find((r) => r.id === p.id) ??
        previous?.parts.find((r) => r.id === p.id) ??
        emptyPart(p, [{ level: 'error', message: 'Not rendered yet' }]),
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
      ...(set ? { set: set.name } : {}),
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
