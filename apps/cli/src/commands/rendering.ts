import { existsSync } from 'node:fs'
import path from 'node:path'
import { type Paths, projectLayout, renderProject, renderSheet, resolveOpenscad } from '@scad/core'
import type { RenderResult } from '@scad/protocol'
import { rel, serverFor, settingsFor } from '../context.ts'
import { viewerApi } from '../server.ts'

export const renderViaServerOrLocal = async (paths: Paths, project: string, parts?: string[], set?: string) => {
  const server = await serverFor(paths)
  if (server && !parts && !set) {
    const result = await viewerApi(server.port).render(project)
    return { result, server }
  }
  const openscad = await resolveOpenscad(paths)
  return { result: await renderProject({ paths, project, openscad, parts, set }), server }
}

export const sheetPath = (paths: Paths, project: string, set?: string) => {
  const layout = projectLayout(paths, project)
  return set ? path.join(layout.preview, `sheet-${set}.png`) : layout.sheet
}

export const sheetFor = async (paths: Paths, project: string, result: RenderResult) => {
  const layout = projectLayout(paths, project)
  const out = sheetPath(paths, project, result.set)
  const models = result.parts.filter((p) => p.model).map((p) => path.join(layout.dir, p.model as string))
  if (!models.length) return { sheet: null, diagnostics: [] }
  const settings = settingsFor(paths, project)
  const openscad = await resolveOpenscad(paths)
  const diagnostics = await renderSheet({ paths, settings, openscad, cwd: layout.dir, temp: layout.temp }, models, out)
  return { sheet: existsSync(out) ? rel(paths, out) : null, diagnostics }
}
