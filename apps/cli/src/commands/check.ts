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

export const check = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  let rendered = null
  if (!isRenderCurrent(paths, readRender(paths, project))) {
    const { result } = await renderViaServerOrLocal(paths, project)
    if (result.status !== 'ok')
      return {
        data: { render: result, check: null },
        text: `${formatRender(result)}\n  Not checked because the render failed.`,
        exitCode: 1,
      }
    rendered = result.finishedAt
  }
  const result = checkProject(paths, project, partsFlag(flags))
  const lines = [formatCheck(result)]
  if (rendered) lines.unshift(`Rendered ${project} first because the sources changed.`)
  if (!flags.part) lines.push(`  report: ${rel(paths, path.join(projectLayout(paths, project).preview, 'check.json'))}`)
  return { data: result, text: lines.join('\n'), exitCode: result.status === 'fail' ? 1 : 0 }
}
