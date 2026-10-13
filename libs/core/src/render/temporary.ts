import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { DefineValue, PartResult } from '@scad/protocol'
import { loadProjectConfig } from '../config/load.ts'
import { syncLibraries } from '../libraries/vendor.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { type Paths, projectLayout } from '../workspace/paths.ts'
import { renderPart } from './part.ts'
import { concurrency, pool } from './pool.ts'

export type TemporaryRenderOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  defines: Record<string, DefineValue>
  outDir: string
  parts?: string[]
}

export const renderTemporary = async (opts: TemporaryRenderOptions): Promise<PartResult[]> => {
  const { paths, project, openscad, defines, outDir } = opts
  const layout = projectLayout(paths, project)
  if (!existsSync(layout.dir)) throw new Error(`Project "${project}" does not exist in ${paths.workspace}`)
  const config = loadProjectConfig(paths, layout.config, project)
  const unknown = (opts.parts ?? []).filter((id) => !config.meta.parts.some((p) => p.id === id))
  if (unknown.length) throw new Error(`Unknown part(s): ${unknown.join(', ')}`)
  const selected = config.meta.parts.filter((p) => p.preview && (!opts.parts || opts.parts.includes(p.id)))
  const work = path.join(outDir, 'work')
  mkdirSync(work, { recursive: true })
  await syncLibraries(paths, config.settings)
  const ctx = { paths, openscad, config, dir: layout.dir, work, outDir, overrides: {}, deps: new Set<string>() }
  return pool(selected, concurrency(), (part) =>
    renderPart(ctx, { ...part, defines: { ...part.defines, ...defines } }, undefined),
  )
}
