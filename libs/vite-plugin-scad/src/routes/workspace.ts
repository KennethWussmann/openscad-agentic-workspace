import { projectExists } from '@scad/core'
import { APP_ID, EVENTS, type Health, type NavigateEvent } from '@scad/protocol'
import type { ServerContext } from '../context.ts'
import { json, type Req, type Res, readBody } from '../http/respond.ts'

export const workspaceRoute = async (ctx: ServerContext, req: Req, res: Res, method: string, parts: string[]) => {
  const { paths } = ctx
  if (method === 'GET' && parts[0] === 'health' && parts.length === 1) {
    json(res, 200, { app: APP_ID, root: paths.root, workspace: paths.workspace, pid: process.pid } satisfies Health)
    return true
  }
  if (method === 'GET' && parts[0] === 'viewers') {
    json(res, 200, ctx.viewers())
    return true
  }
  if (method === 'POST' && parts[0] === 'navigate') {
    const body = (await readBody(req)) as { project?: string }
    if (!body.project || !projectExists(paths, body.project)) json(res, 404, { error: 'unknown project' })
    else {
      ctx.send<NavigateEvent>(EVENTS.navigate, { project: body.project })
      json(res, 200, ctx.viewers())
    }
    return true
  }
  return false
}
