import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import { listProjects, type Paths, readRender, toPosix } from '@scad/core'
import { isProjectId } from '@scad/protocol'
import type { ViteDevServer } from 'vite'

export type WatchHandlers = {
  sourcesChanged: (project: string) => void
  changed: (project: string) => void
}

const dependents = (paths: Paths, file: string) =>
  listProjects(paths)
    .map((p) => p.id)
    .filter((id) => readRender(paths, id)?.inputs.some((i) => path.join(paths.workspace, i.path) === file))

export const watchWorkspace = (server: ViteDevServer, paths: Paths, handlers: WatchHandlers) => {
  const onFile = (filename: string) => {
    const rel = toPosix(filename)
    const [head, second] = rel.split('/')
    if (head === '_libs') {
      for (const id of dependents(paths, path.join(paths.workspace, filename))) handlers.sourcesChanged(id)
      return
    }
    if (!isProjectId(head) || !second) return
    if (second === 'src' || second === 'config.yaml') {
      handlers.sourcesChanged(head)
      handlers.changed(head)
    } else if (second === 'versions' || second === 'proposals' || rel === `${head}/preview/render.json`)
      handlers.changed(head)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(paths.workspace, { recursive: true }, (_event, filename) => {
      if (filename) onFile(filename.toString())
    })
    watcher.on('error', (e) => server.config.logger.warn(`[scad] file watcher: ${String(e)}`))
  } catch (e) {
    server.config.logger.warn(`[scad] file watching disabled: ${String(e)}`)
  }
  server.httpServer?.on('close', () => watcher?.close())
}
