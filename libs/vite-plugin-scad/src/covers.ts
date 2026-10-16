import { existsSync, statSync } from 'node:fs'
import { generateCover, listProjects, type Paths, projectLayout } from '@scad/core'

export const createCovers = (paths: Paths, onDone: (project: string) => void) => {
  const pending = new Set<string>()
  let active = false

  const pump = async () => {
    if (active) return
    active = true
    for (let project = pending.values().next().value; project !== undefined; project = pending.values().next().value) {
      pending.delete(project)
      if (await generateCover(paths, project).catch(() => false)) onDone(project)
    }
    active = false
  }

  const request = (project: string) => {
    pending.add(project)
    pump().catch(() => undefined)
  }

  const backfill = () => {
    for (const p of listProjects(paths)) {
      const layout = projectLayout(paths, p.id)
      if (p.status !== 'ok' || !existsSync(layout.renderFile)) continue
      if (p.cover === null || p.cover < statSync(layout.renderFile).mtimeMs) request(p.id)
    }
  }

  return { request, backfill }
}
