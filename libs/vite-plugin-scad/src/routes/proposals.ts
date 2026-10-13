import path from 'node:path'
import {
  clearAnnotations,
  clearParamProposal,
  MAX_SNAPSHOT_BYTES,
  projectLayout,
  projectState,
  toPosix,
  writeAnnotations,
  writeParamProposal,
} from '@scad/core'
import type { DefineValue } from '@scad/protocol'
import { errorMessage } from '@scad/protocol'
import type { ServerContext } from '../context.ts'
import { json, MAX_BODY, type Req, type Res, readBody } from '../http/respond.ts'

const MAX_ANNOTATION_BODY = Math.ceil(MAX_SNAPSHOT_BYTES * 1.4) + MAX_BODY

const latestVersion = (ctx: ServerContext, id: string) => projectState(ctx.paths, id).versions.at(-1)?.id ?? null

const relative = (ctx: ServerContext, file: string) => toPosix(path.relative(ctx.paths.root, file))

export const sendProposalRoute = async (ctx: ServerContext, req: Req, res: Res, id: string) => {
  const body = (await readBody(req)) as { params?: Record<string, DefineValue>; note?: string }
  if (!body.params || !Object.keys(body.params).length) return json(res, 400, { error: 'no params' })
  writeParamProposal(ctx.paths, id, {
    params: body.params,
    ...(body.note ? { note: body.note } : {}),
    createdAt: new Date().toISOString(),
    basedOn: latestVersion(ctx, id),
  })
  ctx.changed(id)
  return json(res, 200, { ok: true, file: relative(ctx, projectLayout(ctx.paths, id).paramProposal) })
}

export const discardProposalRoute = (ctx: ServerContext, res: Res, id: string) => {
  clearParamProposal(ctx.paths, id)
  ctx.changed(id)
  return json(res, 200, { ok: true })
}

export const sendAnnotationsRoute = async (ctx: ServerContext, req: Req, res: Res, id: string) => {
  const body = await readBody(req, MAX_ANNOTATION_BODY)
  let proposal: ReturnType<typeof writeAnnotations>
  try {
    proposal = writeAnnotations(ctx.paths, id, body, latestVersion(ctx, id))
  } catch (e) {
    return json(res, 400, { error: errorMessage(e) })
  }
  ctx.changed(id)
  return json(res, 200, {
    ok: true,
    count: proposal.annotations.length,
    file: relative(ctx, projectLayout(ctx.paths, id).annotations),
  })
}

export const withdrawAnnotationsRoute = (ctx: ServerContext, res: Res, id: string) => {
  clearAnnotations(ctx.paths, id)
  ctx.changed(id)
  return json(res, 200, { ok: true })
}
