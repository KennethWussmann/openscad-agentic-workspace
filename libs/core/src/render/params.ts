import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Diagnostic, ParamDef } from '@scad/protocol'
import type { ProjectConfig } from '../config/schema.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { mergeParams, parseParamExport } from '../openscad/params.ts'
import { runOpenscad } from '../openscad/run.ts'
import type { Paths } from '../workspace/paths.ts'
import { concurrency, pool } from './pool.ts'

export type ParamsContext = {
  paths: Paths
  openscad: Openscad
  config: ProjectConfig
  dir: string
  work: string
}

export const extractParams = async ({
  paths,
  openscad,
  config,
  dir,
  work,
}: ParamsContext): Promise<{ params: ParamDef[]; diagnostics: Diagnostic[] }> => {
  const files = [...new Set(config.meta.parts.map((p) => p.file))]
  const hidden = new Set(config.meta.parts.flatMap((p) => Object.keys(p.defines)))
  const diagnostics: Diagnostic[] = []
  const lists = await pool(files, concurrency(), async (file, i = files.indexOf(file)) => {
    const abs = path.resolve(dir, file)
    if (!existsSync(abs)) return []
    const out = path.join(work, `params-${i}.json`)
    const run = await runOpenscad({
      command: openscad.command,
      args: ['--export-format', 'param', '-o', out, abs],
      cwd: dir,
      paths,
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
