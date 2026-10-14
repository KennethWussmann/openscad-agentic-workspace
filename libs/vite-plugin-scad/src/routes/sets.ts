import { loadProjectConfig, projectLayout, readRender, removeSet, saveSet, validateSets } from '@scad/core'
import { type DefineValue, errorMessage, type SetsResponse } from '@scad/protocol'
import type { ServerContext } from '../context.ts'
import { json, type Req, type Res, readBody } from '../http/respond.ts'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const respond = (ctx: ServerContext, res: Res, id: string) => {
  const { meta } = loadProjectConfig(ctx.paths, projectLayout(ctx.paths, id).config, id)
  const params = readRender(ctx.paths, id)?.params ?? []
  ctx.changed(id)
  return json(res, 200, { ok: true, sets: meta.sets, issues: validateSets(meta, params) } satisfies SetsResponse)
}

export const saveSetRoute = async (ctx: ServerContext, req: Req, res: Res, id: string) => {
  const body = await readBody(req)
  if (!isRecord(body) || typeof body.name !== 'string' || !isRecord(body.values))
    return json(res, 400, { error: 'expected { name, values }' })
  if (body.label !== undefined && typeof body.label !== 'string')
    return json(res, 400, { error: 'label must be a string' })
  if (body.export !== undefined && typeof body.export !== 'boolean')
    return json(res, 400, { error: 'export must be a boolean' })
  const render = readRender(ctx.paths, id)
  if (!render) return json(res, 409, { error: 'render the project before saving sets' })
  try {
    saveSet({
      paths: ctx.paths,
      project: id,
      name: body.name,
      values: body.values as Record<string, DefineValue>,
      label: body.label,
      export: body.export,
      replace: body.replace === true,
      params: render.params,
    })
  } catch (e) {
    return json(res, 400, { error: errorMessage(e) })
  }
  return respond(ctx, res, id)
}

export const deleteSetRoute = (ctx: ServerContext, res: Res, id: string, name: string | undefined) => {
  if (!name) return json(res, 400, { error: 'missing set name' })
  try {
    removeSet(ctx.paths, id, name)
  } catch (e) {
    return json(res, 404, { error: errorMessage(e) })
  }
  return respond(ctx, res, id)
}
