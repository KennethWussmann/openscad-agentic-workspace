import path from 'node:path'
import {
  checkProject,
  checkState,
  isRenderCurrent,
  type Paths,
  projectLayout,
  readRender,
  requireProject,
} from '@scad/core'
import type { RenderResult } from '@scad/protocol'
import { type Ctx, need, type Outcome, partsFlag, rel } from '../context.ts'
import { formatCheck } from '../format/check.ts'
import { formatRender } from '../format/render.ts'
import { renderViaServerOrLocal } from './rendering.ts'

export const checkHint = (paths: Paths, project: string) => {
  const { status } = checkState(paths, project)
  const message =
    status === 'missing'
      ? `not checked yet, run \`pnpm scad check ${project}\``
      : status === 'stale'
        ? `the last check is older than the render, run \`pnpm scad check ${project}\``
        : status === 'fail'
          ? `the last check failed, see \`pnpm scad check ${project}\``
          : null
  return { status, message }
}

export const freshCheck = async (paths: Paths, project: string, parts?: string[]) => {
  if (isRenderCurrent(paths, readRender(paths, project)))
    return { rendered: null, result: checkProject(paths, project, parts) }
  const { result: rendered } = await renderViaServerOrLocal(paths, project)
  return { rendered, result: rendered.status === 'ok' ? checkProject(paths, project, parts) : null }
}

export const renderFailedOutcome = (render: RenderResult | null, what: string): Outcome => ({
  data: { render, check: null },
  text: `${render ? formatRender(render) : ''}\n  Not ${what} because the render failed.`,
  exitCode: 1,
})

export const check = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const { rendered, result } = await freshCheck(paths, project, partsFlag(flags))
  if (!result) return renderFailedOutcome(rendered, 'checked')
  const lines = [formatCheck(result, flags.all)]
  if (rendered) lines.unshift(`Rendered ${project} first because the sources changed.`)
  if (!flags.part) lines.push(`  report: ${rel(paths, path.join(projectLayout(paths, project).preview, 'check.json'))}`)
  return { data: result, text: lines.join('\n'), exitCode: result.status === 'fail' ? 1 : 0 }
}
