import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { AssemblyResult, DefineValue, PartResult } from '@scad/protocol'
import { loadProjectConfig } from '../config/load.ts'
import { syncLibraries } from '../libraries/vendor.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { resolveSet, setParts } from '../sets/sets.ts'
import { type Paths, projectLayout } from '../workspace/paths.ts'
import { assemblyDir, renderAssembly } from './assembly.ts'
import { renderPart } from './part.ts'
import { concurrency, pool } from './pool.ts'

export type TemporaryRenderOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  defines: Record<string, DefineValue>
  outDir: string
  parts?: string[]
  assembly?: string
  set?: string | null
}

export const renderTemporary = async (opts: TemporaryRenderOptions): Promise<PartResult[] | AssemblyResult> => {
  const { paths, project, openscad, defines, outDir } = opts
  const layout = projectLayout(paths, project)
  if (!existsSync(layout.dir)) throw new Error(`Project "${project}" does not exist in ${paths.workspace}`)
  const config = loadProjectConfig(paths, layout.config, project)
  const unknown = (opts.parts ?? []).filter((id) => !config.meta.parts.some((p) => p.id === id))
  if (unknown.length) throw new Error(`Unknown part(s): ${unknown.join(', ')}`)
  const set = resolveSet(config.meta, opts.set)
  const work = path.join(outDir, 'work')
  mkdirSync(work, { recursive: true })
  await syncLibraries(paths, config.settings)
  const ctx = { paths, openscad, config, dir: layout.dir, work, outDir, set, overrides: {}, deps: new Set<string>() }
  if (opts.assembly) {
    const found = config.meta.assemblies.find((a) => a.id === opts.assembly)
    if (!found) throw new Error(`Unknown assembly "${opts.assembly}"`)
    const assembly = { ...found, defines: { ...found.defines, ...defines } }
    return renderAssembly(
      ctx,
      assembly,
      setParts(config.meta.parts, set).map((p) => p.id),
      assemblyDir(outDir, assembly.id),
    )
  }
  const selected = setParts(config.meta.parts, set).filter(
    (p) => p.preview && (!opts.parts || opts.parts.includes(p.id)),
  )
  return pool(selected, concurrency(), (part) =>
    renderPart(ctx, { ...part, defines: { ...part.defines, ...defines } }, undefined),
  )
}
