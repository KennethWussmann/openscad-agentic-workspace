import { existsSync } from 'node:fs'
import path from 'node:path'
import type { RenderResult } from '@scad/protocol'
import { runProcess } from '../../process/run.ts'
import { readRender } from '../../render/store.ts'
import { type Paths, projectLayout } from '../../workspace/paths.ts'

const RUNNER = ['libs', 'core', 'src', 'views', 'cover', 'run.ts']
const TIMEOUT_MS = 60_000

export const coverModels = (paths: Paths, project: string, render: RenderResult) => {
  const layout = projectLayout(paths, project)
  return render.parts
    .filter((p) => p.model)
    .map((p) => path.join(layout.dir, p.model as string))
    .filter((m) => existsSync(m))
}

export const generateCover = async (paths: Paths, project: string, render?: RenderResult | null) => {
  const result = render ?? readRender(paths, project)
  if (result?.status !== 'ok' || result.set) return false
  const models = coverModels(paths, project, result)
  if (!models.length) return false
  const run = await runProcess({
    command: process.execPath,
    args: [path.join(paths.root, ...RUNNER), projectLayout(paths, project).cover, ...models],
    timeoutMs: TIMEOUT_MS,
  })
  return run.code === 0
}
