import path from 'node:path'
import type { RenderResult } from '@scad/protocol'
import { runProcess } from '../../process/run.ts'
import { readRender, renderModels } from '../../render/store.ts'
import { type Paths, projectLayout } from '../../workspace/paths.ts'

const RUNNER = ['libs', 'core', 'src', 'views', 'cover', 'run.ts']
const TIMEOUT_MS = 60_000

export const generateCover = async (paths: Paths, project: string, render?: RenderResult | null) => {
  const result = render ?? readRender(paths, project)
  if (result?.status !== 'ok' || result.set) return false
  const models = renderModels(paths, project, result)
  if (!models.length) return false
  const run = await runProcess({
    command: process.execPath,
    args: [path.join(paths.root, ...RUNNER), projectLayout(paths, project).cover, ...models],
    timeoutMs: TIMEOUT_MS,
  })
  return run.code === 0
}
