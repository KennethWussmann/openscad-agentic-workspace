import { exportProject, projectState, resolveOpenscad } from '@scad/core'
import {
  DEFAULT_SET,
  type DefineValue,
  EVENTS,
  type ExportEvent,
  type ExportStartEvent,
  errorMessage,
} from '@scad/protocol'
import type { ServerContext } from '../context.ts'
import { json, type Req, type Res, readBody } from '../http/respond.ts'

export const exportRoute = async (ctx: ServerContext, req: Req, res: Res, id: string) => {
  const { paths, exporting, send } = ctx
  const body = (await readBody(req)) as { overrides?: unknown; set?: unknown; part?: unknown; assembly?: unknown }
  const overrides = body.overrides ?? {}
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))
    return json(res, 400, { error: 'overrides must be an object' })
  if (body.set !== undefined && typeof body.set !== 'string') return json(res, 400, { error: 'set must be a string' })
  if (body.part !== undefined && typeof body.part !== 'string')
    return json(res, 400, { error: 'part must be a string' })
  if (body.assembly !== undefined && typeof body.assembly !== 'string')
    return json(res, 400, { error: 'assembly must be a string' })
  const state = projectState(paths, id)
  const set = body.set && body.set !== DEFAULT_SET ? body.set : null
  if (set && !(set in state.sets)) return json(res, 400, { error: `unknown set "${set}"` })
  if (exporting.has(id)) return json(res, 409, { error: 'an export is already running' })
  const values = overrides as Record<string, DefineValue>
  const assembly = typeof body.assembly === 'string' ? body.assembly : null
  if (assembly && !state.assemblies.some((a) => a.id === assembly))
    return json(res, 400, { error: `unknown assembly "${assembly}"` })
  const part = typeof body.part === 'string' ? body.part : null
  if (part && !state.parts.some((p) => p.id === part)) return json(res, 400, { error: `unknown part "${part}"` })
  const parts = assembly ? [] : part ? [part] : state.parts.filter((p) => p.preview).map((p) => p.id)
  exporting.add(id)
  send<ExportStartEvent>(EVENTS.exportStart, { project: id, tweaked: Object.keys(values).length > 0, set })
  try {
    const openscad = await resolveOpenscad(paths)
    const result = await exportProject({
      paths,
      project: id,
      openscad,
      formats: ['3mf'],
      parts,
      ...(assembly ? { assemblies: [assembly] } : {}),
      overrides: values,
      sets: [set ?? DEFAULT_SET],
      meshCheck: true,
    })
    send<ExportEvent>(EVENTS.export, { project: id, result })
    return json(res, 200, result)
  } catch (e) {
    const error = errorMessage(e)
    send<ExportEvent>(EVENTS.export, { project: id, result: null, error })
    return json(res, 500, { error })
  } finally {
    exporting.delete(id)
  }
}
