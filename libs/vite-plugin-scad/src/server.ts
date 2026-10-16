import { mkdirSync } from 'node:fs'
import { isRenderCurrent, type Paths, projectExists, readRender, renderProject, resolveOpenscad } from '@scad/core'
import {
  API,
  type ChangedEvent,
  type DefineValue,
  EVENTS,
  errorMessage,
  type RenderEvent,
  type RenderKind,
  type RenderResult,
  type RenderStartEvent,
} from '@scad/protocol'
import type { ViteDevServer } from 'vite'
import type { ServerContext } from './context.ts'
import { createCoordinator } from './coordinator.ts'
import { createCovers } from './covers.ts'
import { createDebouncer } from './debounce.ts'
import { json } from './http/respond.ts'
import { createPresence } from './presence.ts'
import { projectRoute } from './routes/project.ts'
import { workspaceRoute } from './routes/workspace.ts'
import { watchWorkspace } from './watcher.ts'

const failed = (project: string, error: unknown): RenderResult => {
  const now = new Date().toISOString()
  return {
    project,
    status: 'error',
    error: errorMessage(error),
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    overrides: {},
    parts: [],
    params: [],
    inputs: [],
  }
}

export const createScadServer = (server: ViteDevServer, paths: Paths, debounceMs: number) => {
  mkdirSync(paths.workspace, { recursive: true })
  const tweaks = new Map<string, Record<string, DefineValue>>()
  const send = <T>(event: string, data: T) => server.ws.send({ type: 'custom', event, data })

  const debounce = createDebouncer(debounceMs)
  const changed = (project: string) =>
    debounce(`changed:${project}`, () => send<ChangedEvent>(EVENTS.changed, { project }), 150)
  const covers = createCovers(paths, changed)
  setTimeout(covers.backfill, 500)

  const coordinator = createCoordinator(async (project, kind, overrides, force) => {
    if (!force && kind === 'preview') {
      const current = readRender(paths, project)
      if (current && isRenderCurrent(paths, current)) return current
    }
    send<RenderStartEvent>(EVENTS.renderStart, { project, kind })
    let result: RenderResult
    try {
      const openscad = await resolveOpenscad(paths)
      result = await renderProject({ paths, project, openscad, kind, overrides })
    } catch (e) {
      result = failed(project, e)
    }
    send<RenderEvent>(EVENTS.render, { project, kind, result })
    if (kind === 'preview' && result.status === 'ok') covers.request(project)
    return result
  })

  const request = (project: string, kind: RenderKind, force = true) =>
    coordinator.request(project, kind, kind === 'tweak' ? (tweaks.get(project) ?? {}) : {}, force)

  const sourcesChanged = (project: string) =>
    debounce(`render:${project}`, () => {
      if (!projectExists(paths, project)) return
      request(project, 'preview', false).catch(() => undefined)
      if (tweaks.has(project)) request(project, 'tweak').catch(() => undefined)
    })

  watchWorkspace(server, paths, { sourcesChanged, changed })
  const viewers = createPresence(server)

  const ctx: ServerContext = {
    paths,
    coordinator,
    tweaks,
    exporting: new Set(),
    send,
    request,
    changed,
    viewers,
  }

  server.middlewares.use(API, (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const method = req.method ?? 'GET'
    const handle = async () => {
      if (await workspaceRoute(ctx, req, res, method, parts)) return
      if (parts[0] === 'projects') return projectRoute(ctx, req, res, next, method, parts)
      next()
    }
    handle().catch((e: unknown) => json(res, 500, { error: errorMessage(e) }))
  })

  return { coordinator, viewers }
}
