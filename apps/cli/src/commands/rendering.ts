import { existsSync } from 'node:fs'
import path from 'node:path'
import { type Paths, projectLayout, renderProject, renderSheet, resolveOpenscad } from '@scad/core'
import type { RenderResult } from '@scad/protocol'
import { rel, serverFor, settingsFor } from '../context.ts'
import { viewerApi } from '../server.ts'

export const renderViaServerOrLocal = async (paths: Paths, project: string, parts?: string[]) => {
  const server = await serverFor(paths)
  if (server && !parts) {
    const result = await viewerApi(server.port).render(project)
    return { result, server }
  }
  const openscad = await resolveOpenscad(paths)
  return { result: await renderProject({ paths, project, openscad, parts }), server }
}

export const sheetFor = async (paths: Paths, project: string, result: RenderResult) => {
  const layout = projectLayout(paths, project)
  const models = result.parts.filter((p) => p.model).map((p) => path.join(layout.dir, p.model as string))
  if (!models.length) return { sheet: null, diagnostics: [] }
  const settings = settingsFor(paths, project)
  const openscad = await resolveOpenscad(paths)
  const diagnostics = await renderSheet(
    { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
    models,
    layout.sheet,
  )
  return { sheet: existsSync(layout.sheet) ? rel(paths, layout.sheet) : null, diagnostics }
}
