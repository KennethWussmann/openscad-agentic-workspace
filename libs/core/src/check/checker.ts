import { existsSync } from 'node:fs'
import path from 'node:path'
import { analyzeMesh, worstStatus } from '@scad/geometry'
import type { CheckResult, CheckStatus, PartCheck, PrintProfile } from '@scad/protocol'
import { loadProjectConfig } from '../config/load.ts'
import { printProfile } from '../config/profile.ts'
import { readJson, writeJsonAtomic } from '../fs/json.ts'
import { read3mf } from '../mesh/model3mf.ts'
import { isRenderCurrent, readRender } from '../render/store.ts'
import { type Paths, projectLayout } from '../workspace/paths.ts'

export const checkFile = (paths: Paths, project: string, set?: string | null) =>
  path.join(projectLayout(paths, project).preview, set ? `check-${set}.json` : 'check.json')

export const readCheck = (paths: Paths, project: string, set?: string | null) =>
  readJson<CheckResult>(checkFile(paths, project, set))

export const checkModel = (file: string, part: { id: string; label?: string }, profile: PrintProfile): PartCheck => {
  const started = Date.now()
  const mesh = read3mf(file)
  const analysis = analyzeMesh(mesh.positions, mesh.index, profile)
  return { id: part.id, label: part.label, ...analysis, durationMs: Date.now() - started }
}

export const checkResult = (
  project: string,
  parts: PartCheck[],
  profile: PrintProfile,
  render: string,
): CheckResult => ({
  project,
  status: worstStatus(parts.map((p) => p.status)),
  checkedAt: new Date().toISOString(),
  render,
  profile,
  parts,
})

export const checkProject = (paths: Paths, project: string, parts?: string[], set?: string | null): CheckResult => {
  const layout = projectLayout(paths, project)
  const render = readRender(paths, project, 'preview', set)
  if (!render)
    throw new Error(
      `Project "${project}" has not been rendered${set ? ` with set "${set}"` : ''} yet. Run render first.`,
    )
  if (render.status !== 'ok') throw new Error('The last render has errors. Fix them and render again before checking.')
  const unknown = (parts ?? []).filter((id) => !render.parts.some((p) => p.id === id))
  if (unknown.length) throw new Error(`Unknown part(s): ${unknown.join(', ')}`)
  const profile = printProfile(loadProjectConfig(paths, layout.config, project).settings)
  const results = render.parts
    .filter((p) => p.model && (!parts || parts.includes(p.id)))
    .map((part) => {
      const file = path.join(layout.dir, part.model as string)
      if (!existsSync(file)) throw new Error(`Model ${part.model} is missing. Render again.`)
      return checkModel(file, part, profile)
    })
  const result = { ...checkResult(project, results, profile, render.finishedAt), ...(set ? { set } : {}) }
  if (!parts) writeJsonAtomic(checkFile(paths, project, set), result)
  return result
}

export type CheckState = { status: CheckStatus | 'missing' | 'stale'; result: CheckResult | null }

export const checkState = (paths: Paths, project: string, set?: string | null): CheckState => {
  const result = readCheck(paths, project, set)
  if (!result) return { status: 'missing', result: null }
  const render = readRender(paths, project, 'preview', set)
  if (!isRenderCurrent(paths, render) || render?.finishedAt !== result.render) return { status: 'stale', result }
  return { status: result.status, result }
}
