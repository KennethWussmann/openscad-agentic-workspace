import { exportProject, projectState, resolveOpenscad } from '@scad/core'
import { type DefineValue, EVENTS, type ExportEvent, type ExportStartEvent, errorMessage } from '@scad/protocol'
import type { ServerContext } from '../context.ts'
import { json, type Req, type Res, readBody } from '../http/respond.ts'

export const exportRoute = async (ctx: ServerContext, req: Req, res: Res, id: string) => {
  const { paths, exporting, send } = ctx
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
    const error = errorMessage(e)
    send<ExportEvent>(EVENTS.export, { project: id, result: null, error })
    return json(res, 500, { error })
  } finally {
    exporting.delete(id)
  }
}
