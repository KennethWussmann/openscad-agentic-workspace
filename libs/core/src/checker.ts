import { existsSync } from 'node:fs'
import path from 'node:path'
import { analyzeMesh, worstStatus } from './check.ts'
import { checkSettings, loadProjectConfig } from './config.ts'
import { read3mf } from './mesh3mf.ts'
import { type Paths, projectLayout } from './paths.ts'
import type { CheckResult, CheckStatus, PartCheck } from './protocol.ts'
import { isRenderCurrent, readJson, readRender, writeJsonAtomic } from './render.ts'

export const checkFile = (paths: Paths, project: string) =>
  path.join(projectLayout(paths, project).preview, 'check.json')

export const readCheck = (paths: Paths, project: string) => readJson<CheckResult>(checkFile(paths, project))

export const checkProject = (paths: Paths, project: string, parts?: string[]): CheckResult => {
  const layout = projectLayout(paths, project)
  const render = readRender(paths, project)
  if (!render) throw new Error(`Project "${project}" has not been rendered yet. Run render first.`)
  if (render.status !== 'ok') throw new Error('The last render has errors. Fix them and render again before checking.')
  const unknown = (parts ?? []).filter((id) => !render.parts.some((p) => p.id === id))
  if (unknown.length) throw new Error(`Unknown part(s): ${unknown.join(', ')}`)
  const settings = checkSettings(loadProjectConfig(paths, layout.config, project).settings)
  const results: PartCheck[] = render.parts
    .filter((p) => p.model && (!parts || parts.includes(p.id)))
    .map((part) => {
      const started = Date.now()
      const file = path.join(layout.dir, part.model as string)
      if (!existsSync(file)) throw new Error(`Model ${part.model} is missing. Render again.`)
      const mesh = read3mf(file)
      const analysis = analyzeMesh(mesh.positions, mesh.index, settings)
      return { id: part.id, label: part.label, ...analysis, durationMs: Date.now() - started }
    })
  const result: CheckResult = {
    project,
    status: worstStatus(results.map((p) => p.status)),
    checkedAt: new Date().toISOString(),
    render: render.finishedAt,
    settings,
    parts: results,
  }
  if (!parts) writeJsonAtomic(checkFile(paths, project), result)
  return result
}

export type CheckState = { status: CheckStatus | 'missing' | 'stale'; result: CheckResult | null }

export const checkState = (paths: Paths, project: string): CheckState => {
  const result = readCheck(paths, project)
  if (!result) return { status: 'missing', result: null }
  const render = readRender(paths, project)
  if (!isRenderCurrent(paths, render) || render?.finishedAt !== result.render) return { status: 'stale', result }
  return { status: result.status, result }
}
