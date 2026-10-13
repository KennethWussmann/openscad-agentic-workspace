import { checkpoint, exportProject, requireProject, resolveOpenscad } from '@scad/core'
import { type Ctx, need, type Outcome, settingsFor, UsageError } from '../context.ts'
import { formatCheck } from '../format/check.ts'
import { formatBBox } from '../format/common.ts'
import { freshCheck, renderFailedOutcome } from './check.ts'
import { exportFailed, formatExport, parseFormats } from './export.ts'
import { sheetFor } from './rendering.ts'

export const release = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const message = need(flags.message, '--message (-m)')
  if (flags.part) throw new UsageError('release covers every part; use check, checkpoint and export for a subset')
  const formats = parseFormats(flags)
  const { rendered, result } = await freshCheck(paths, project)
  if (!result) return renderFailedOutcome(rendered, 'released')
  if (rendered && settingsFor(paths, project).render.sheet) await sheetFor(paths, project, rendered)
  const lines = [result.status === 'pass' ? `PASS  check  ${project}` : formatCheck(result, flags.all)]
  if (result.status === 'fail' && !flags['accept-fail']) {
    lines.push(
      '  Not checkpointed or exported because the check failed.',
      '  Fix the FAILs, or pass --accept-fail when the user accepted them and they are recorded under Decisions in brief.md.',
    )
    return { data: { check: result, version: null, export: null }, text: lines.join('\n'), exitCode: 1 }
  }
  const version = checkpoint({ paths, project, message, force: flags.force })
  lines.push(
    `Checkpointed ${project} ${version.id}: ${message}`,
    ...version.parts.map((p) => `  ${p.id} ${formatBBox(p.bbox)}`),
  )
  const openscad = await resolveOpenscad(paths)
  const exported = await exportProject({ paths, project, openscad, formats })
  lines.push(...formatExport(paths, project, exported))
  return {
    data: { check: result, version, export: exported },
    text: lines.join('\n'),
    exitCode: exportFailed(exported) ? 1 : 0,
  }
}
