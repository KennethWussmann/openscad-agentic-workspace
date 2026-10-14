import {
  checkFile,
  checkProject,
  checkState,
  isRenderCurrent,
  loadProjectConfig,
  type Paths,
  readRender,
  requireProject,
  requireSet,
  validateSets,
} from '@scad/core'
import type { RenderResult } from '@scad/protocol'
import { type Ctx, need, type Outcome, partsFlag, rel } from '../context.ts'
import { formatCheck } from '../format/check.ts'
import { formatRender } from '../format/render.ts'
import { formatSetIssues } from '../format/sets.ts'
import { renderViaServerOrLocal } from './rendering.ts'

export const checkHint = (paths: Paths, project: string, set?: string) => {
  const { status } = checkState(paths, project, set)
  const command = `\`pnpm scad check ${project}${set ? ` --set ${set}` : ''}\``
  const subject = set ? `set ${set}: ` : ''
  const message =
    status === 'missing'
      ? `${subject}not checked yet, run ${command}`
      : status === 'stale'
        ? `${subject}the last check is older than the render, run ${command}`
        : status === 'fail'
          ? `${subject}the last check failed, see ${command}`
          : null
  return { status, message }
}

export const freshCheck = async (paths: Paths, project: string, parts?: string[], set?: string) => {
  if (isRenderCurrent(paths, readRender(paths, project, 'preview', set)))
    return { rendered: null, result: checkProject(paths, project, parts, set) }
  const { result: rendered } = await renderViaServerOrLocal(paths, project, undefined, set)
  return { rendered, result: rendered.status === 'ok' ? checkProject(paths, project, parts, set) : null }
}

export const renderFailedOutcome = (render: RenderResult | null, what: string): Outcome => ({
  data: { render, check: null },
  text: `${render ? formatRender(render) : ''}\n  Not ${what} because the render failed.`,
  exitCode: 1,
})

export const check = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const { meta } = loadProjectConfig(paths, layout.config, project)
  const set = flags.set ? requireSet(meta, flags.set).name : undefined
  const { rendered, result } = await freshCheck(paths, project, partsFlag(flags), set)
  if (!result) return renderFailedOutcome(rendered, 'checked')
  const lines = [formatCheck(result, flags.all)]
  if (rendered) lines.unshift(`Rendered ${project}${set ? ` with set ${set}` : ''} first because the sources changed.`)
  const setIssues = validateSets(meta, readRender(paths, project)?.params ?? rendered?.params ?? [])
  lines.push(...formatSetIssues(setIssues))
  if (!flags.part) lines.push(`  report: ${rel(paths, checkFile(paths, project, set))}`)
  return { data: { ...result, setIssues }, text: lines.join('\n'), exitCode: result.status === 'fail' ? 1 : 0 }
}
