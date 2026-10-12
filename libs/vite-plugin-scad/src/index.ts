import { existsSync, type FSWatcher, mkdirSync, readFileSync, rmSync, statSync, watch } from 'node:fs'
import path from 'node:path'
import {
  API,
  APP_ID,
  type ChangedEvent,
  clearAnnotations,
  clearParamProposal,
  type DefineValue,
  EVENTS,
  type ExportEvent,
  type ExportStartEvent,
  exportProject,
  findRepoRoot,
  type Health,
  isInside,
  isProjectId,
  listProjects,
  MAX_SNAPSHOT_BYTES,
  type NavigateEvent,
  type Paths,
  type PresenceEvent,
  projectExists,
  projectLayout,
  projectState,
  type RenderEvent,
  type RenderResult,
  type RenderStartEvent,
  readRender,
  renderProject,
  resolveOpenscad,
  resolvePaths,
  toPosix,
  writeAnnotations,
  writeParamProposal,
} from '@scad/core'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import { createCoordinator, type RenderKind } from './coordinator.ts'

export type ScadWorkspaceOptions = {
  root?: string
  workspace?: string
  config?: string
  debounceMs?: number
}

type Res = Parameters<Connect.NextHandleFunction>[1]

const MAX_BODY = 1024 * 1024
const PRESENCE_TTL = 20000
const MAX_ANNOTATION_BODY = Math.ceil(MAX_SNAPSHOT_BYTES * 1.4) + MAX_BODY
const SERVED = ['preview/', 'versions/', 'temp/tweak/', 'out/', 'proposals/']
const TYPES: Record<string, string> = {
  '.3mf': 'model/3mf',
  '.png': 'image/png',
  '.json': 'application/json',
  '.stl': 'model/stl',
}

const json = (res: Res, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const readBody = (req: Connect.IncomingMessage, limit = MAX_BODY) =>
  new Promise<unknown>((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) reject(new Error('Body too large'))
      else chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })

const failed = (project: string, error: unknown): RenderResult => {
  const now = new Date().toISOString()
  return {
    project,
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
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
  const presence = new Map<string, { project: string | null; seen: number }>()
  const exporting = new Set<string>()

  const send = <T>(event: string, data: T) => server.ws.send({ type: 'custom', event, data })

  const coordinator = createCoordinator(async (project, kind, overrides) => {
    send<RenderStartEvent>(EVENTS.renderStart, { project, kind })
    let result: RenderResult
    try {
      const openscad = await resolveOpenscad(paths)
      result = await renderProject({ paths, project, openscad, kind, overrides })
    } catch (e) {
      result = failed(project, e)
    }
    send<RenderEvent>(EVENTS.render, { project, kind, result })
    return result
  })

  const request = (project: string, kind: RenderKind) =>
    coordinator.request(project, kind, kind === 'tweak' ? (tweaks.get(project) ?? {}) : {})

  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const debounce = (key: string, fn: () => void, ms = debounceMs) => {
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        fn()
      }, ms),
    )
  }

  const sourcesChanged = (project: string) =>
    debounce(`render:${project}`, () => {
      if (!projectExists(paths, project)) return
      request(project, 'preview').catch(() => undefined)
      if (tweaks.has(project)) request(project, 'tweak').catch(() => undefined)
    })

  const changed = (project: string) =>
    debounce(`changed:${project}`, () => send<ChangedEvent>(EVENTS.changed, { project }), 150)

  const dependents = (file: string) =>
    listProjects(paths)
      .map((p) => p.id)
      .filter((id) => readRender(paths, id)?.inputs.some((i) => path.join(paths.workspace, i.path) === file))

  const onFile = (filename: string) => {
    const rel = toPosix(filename)
    const [head, second] = rel.split('/')
    if (head === '_libs') {
      for (const id of dependents(path.join(paths.workspace, filename))) sourcesChanged(id)
      return
    }
    if (!isProjectId(head) || !second) return
    if (second === 'src' || second === 'config.yaml') {
      sourcesChanged(head)
      changed(head)
    } else if (second === 'versions' || second === 'proposals' || rel === `${head}/preview/render.json`) changed(head)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(paths.workspace, { recursive: true }, (_event, filename) => {
      if (filename) onFile(filename.toString())
    })
  } catch (e) {
    server.config.logger.warn(`[scad] file watching disabled: ${String(e)}`)
  }
  server.httpServer?.on('close', () => watcher?.close())

  server.ws.on(EVENTS.presence, (data: PresenceEvent) => {
    presence.set(data.tab, { project: data.project, seen: Date.now() })
  })
  server.ws.on(EVENTS.leave, (data: PresenceEvent) => {
    presence.delete(data.tab)
  })

  const viewers = () => {
    const now = Date.now()
    const projects: Record<string, number> = {}
    let total = 0
    for (const [tab, p] of presence) {
      if (now - p.seen > PRESENCE_TTL) {
        presence.delete(tab)
        continue
      }
      total++
      if (p.project) projects[p.project] = (projects[p.project] ?? 0) + 1
    }
    return { total, projects }
  }

  const serveFile = (res: Res, project: string, rel: string) => {
    const layout = projectLayout(paths, project)
    const file = path.resolve(layout.dir, rel)
    if (!SERVED.some((prefix) => rel.startsWith(prefix)) || !isInside(layout.dir, file) || !existsSync(file))
      return json(res, 404, { error: 'not found' })
    res.statusCode = 200
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Length', statSync(file).size)
    res.end(readFileSync(file))
  }

  const handle = async (req: Connect.IncomingMessage, res: Res, next: Connect.NextFunction) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const method = req.method ?? 'GET'
    if (method === 'GET' && parts[0] === 'health' && parts.length === 1)
      return json(res, 200, {
        app: APP_ID,
        root: paths.root,
        workspace: paths.workspace,
        pid: process.pid,
      } satisfies Health)
    if (method === 'GET' && parts[0] === 'viewers') return json(res, 200, viewers())
    if (method === 'POST' && parts[0] === 'navigate') {
      const body = (await readBody(req)) as { project?: string }
      if (!body.project || !projectExists(paths, body.project)) return json(res, 404, { error: 'unknown project' })
      send<NavigateEvent>(EVENTS.navigate, { project: body.project })
      return json(res, 200, viewers())
    }
    if (parts[0] !== 'projects') return next()
    if (method === 'GET' && parts.length === 1) return json(res, 200, listProjects(paths))
    const id = parts[1]
    if (!isProjectId(id)) return json(res, 400, { error: 'invalid project id' })
    if (!projectExists(paths, id)) return json(res, 404, { error: `project "${id}" does not exist` })
    const action = parts[2]
    if (method === 'GET' && !action) {
      const state = projectState(paths, id, coordinator.isRendering(id), exporting.has(id))
      if (!state.render && !state.rendering) {
        request(id, 'preview').catch(() => undefined)
        state.rendering = true
      }
      return json(res, 200, state)
    }
    if (method === 'GET' && action === 'file') return serveFile(res, id, parts.slice(3).join('/'))
    if (method === 'POST' && action === 'render') return json(res, 200, await request(id, 'preview'))
    if (method === 'POST' && action === 'export') {
      const body = (await readBody(req)) as { overrides?: unknown }
      const overrides = body.overrides ?? {}
      if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))
        return json(res, 400, { error: 'overrides must be an object' })
      if (exporting.has(id)) return json(res, 409, { error: 'an export is already running' })
      const values = overrides as Record<string, DefineValue>
      const parts = projectState(paths, id)
        .parts.filter((p) => p.preview)
        .map((p) => p.id)
      exporting.add(id)
      send<ExportStartEvent>(EVENTS.exportStart, { project: id, tweaked: Object.keys(values).length > 0 })
      try {
        const openscad = await resolveOpenscad(paths)
        const result = await exportProject({
          paths,
          project: id,
          openscad,
          formats: ['3mf'],
          parts,
          overrides: values,
          meshCheck: true,
        })
        send<ExportEvent>(EVENTS.export, { project: id, result })
        return json(res, 200, result)
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        send<ExportEvent>(EVENTS.export, { project: id, result: null, error })
        return json(res, 500, { error })
      } finally {
        exporting.delete(id)
      }
    }
    if (method === 'POST' && action === 'tweak') {
      const body = (await readBody(req)) as { params?: Record<string, DefineValue> }
      tweaks.set(id, body.params ?? {})
      return json(res, 200, await request(id, 'tweak'))
    }
    if (method === 'DELETE' && action === 'tweak') {
      tweaks.delete(id)
      rmSync(projectLayout(paths, id).tweak, { recursive: true, force: true })
      changed(id)
      return json(res, 200, { ok: true })
    }
    if (method === 'POST' && action === 'proposal') {
      const body = (await readBody(req)) as { params?: Record<string, DefineValue>; note?: string }
      if (!body.params || !Object.keys(body.params).length) return json(res, 400, { error: 'no params' })
      const state = projectState(paths, id)
      writeParamProposal(paths, id, {
        params: body.params,
        ...(body.note ? { note: body.note } : {}),
        createdAt: new Date().toISOString(),
        basedOn: state.versions.at(-1)?.id ?? null,
      })
      changed(id)
      return json(res, 200, {
        ok: true,
        file: toPosix(path.relative(paths.root, projectLayout(paths, id).paramProposal)),
      })
    }
    if (method === 'DELETE' && action === 'proposal') {
      clearParamProposal(paths, id)
      changed(id)
      return json(res, 200, { ok: true })
    }
    if (method === 'POST' && action === 'annotations') {
      const body = await readBody(req, MAX_ANNOTATION_BODY)
      const basedOn = projectState(paths, id).versions.at(-1)?.id ?? null
      let proposal: ReturnType<typeof writeAnnotations>
      try {
        proposal = writeAnnotations(paths, id, body, basedOn)
      } catch (e) {
        return json(res, 400, { error: e instanceof Error ? e.message : String(e) })
      }
      changed(id)
      return json(res, 200, {
        ok: true,
        count: proposal.annotations.length,
        file: toPosix(path.relative(paths.root, projectLayout(paths, id).annotations)),
      })
    }
    if (method === 'DELETE' && action === 'annotations') {
      clearAnnotations(paths, id)
      changed(id)
      return json(res, 200, { ok: true })
    }
    return next()
  }

  server.middlewares.use(API, (req, res, next) => {
    handle(req, res, next).catch((e: unknown) => json(res, 500, { error: e instanceof Error ? e.message : String(e) }))
  })

  return { coordinator, viewers }
}

export const scadWorkspace = (opts: ScadWorkspaceOptions = {}): Plugin => ({
  name: 'scad-workspace',
  apply: 'serve',
  configureServer: (server) => {
    const paths = resolvePaths({
      root: opts.root ?? findRepoRoot(server.config.root),
      workspace: opts.workspace,
      config: opts.config,
    })
    createScadServer(server, paths, opts.debounceMs ?? 200)
  },
})
