import { rmSync } from 'node:fs'
import { listProjects, projectExists, projectLayout, projectState } from '@scad/core'
import { type DefineValue, isProjectId } from '@scad/protocol'
import type { Connect } from 'vite'
import type { ServerContext } from '../context.ts'
import { serveFile } from '../http/files.ts'
import { json, type Req, type Res, readBody } from '../http/respond.ts'
import { exportRoute } from './export.ts'
import { discardProposalRoute, sendAnnotationsRoute, sendProposalRoute, withdrawAnnotationsRoute } from './proposals.ts'

const state = (ctx: ServerContext, res: Res, id: string) => {
  const current = projectState(ctx.paths, id, ctx.coordinator.isRendering(id), ctx.exporting.has(id))
  if (!current.render && !current.rendering) {
    ctx.request(id, 'preview').catch(() => undefined)
    current.rendering = true
  }
  return json(res, 200, current)
}

const tweak = async (ctx: ServerContext, req: Req, res: Res, id: string) => {
  const body = (await readBody(req)) as { params?: Record<string, DefineValue> }
  ctx.tweaks.set(id, body.params ?? {})
  return json(res, 200, await ctx.request(id, 'tweak'))
}

const clearTweak = (ctx: ServerContext, res: Res, id: string) => {
  ctx.tweaks.delete(id)
  rmSync(projectLayout(ctx.paths, id).tweak, { recursive: true, force: true })
  ctx.changed(id)
  return json(res, 200, { ok: true })
}

export const projectRoute = async (
  ctx: ServerContext,
  req: Req,
  res: Res,
  next: Connect.NextFunction,
  method: string,
  parts: string[],
) => {
  if (method === 'GET' && parts.length === 1) return json(res, 200, listProjects(ctx.paths))
  const id = parts[1]
  if (!isProjectId(id)) return json(res, 400, { error: 'invalid project id' })
  if (!projectExists(ctx.paths, id)) return json(res, 404, { error: `project "${id}" does not exist` })
  const route = `${method} ${parts[2] ?? ''}`
  if (route === 'GET ') return state(ctx, res, id)
  if (route === 'GET file') return serveFile(ctx.paths, res, id, parts.slice(3).join('/'))
  if (route === 'POST render') return json(res, 200, await ctx.request(id, 'preview'))
  if (route === 'POST export') return exportRoute(ctx, req, res, id)
  if (route === 'POST tweak') return tweak(ctx, req, res, id)
  if (route === 'DELETE tweak') return clearTweak(ctx, res, id)
  if (route === 'POST proposal') return sendProposalRoute(ctx, req, res, id)
  if (route === 'DELETE proposal') return discardProposalRoute(ctx, res, id)
  if (route === 'POST annotations') return sendAnnotationsRoute(ctx, req, res, id)
  if (route === 'DELETE annotations') return withdrawAnnotationsRoute(ctx, res, id)
  return next()
}
