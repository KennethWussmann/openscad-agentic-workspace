import {
  checkpoint,
  exportProject,
  exportSetNames,
  loadProjectConfig,
  requireProject,
  resolveOpenscad,
} from '@scad/core'
import { type CheckResult, DEFAULT_SET } from '@scad/protocol'
import { type Ctx, need, type Outcome, settingsFor, UsageError } from '../context.ts'
import { formatCheck } from '../format/check.ts'
import { formatBBox } from '../format/common.ts'
import { freshCheck, renderFailedOutcome } from './check.ts'
import { exportFailed, formatExport, parseFormats } from './export.ts'
import { sheetFor } from './rendering.ts'

export const release = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const message = need(flags.message, '--message (-m)')
  if (flags.part) throw new UsageError('release covers every part; use check, checkpoint and export for a subset')
  if (flags.set || flags.sets)
    throw new UsageError('release covers the default model and every set with `export: true`; use export for others')
  const formats = parseFormats(flags)
  const sets = [DEFAULT_SET, ...exportSetNames(loadProjectConfig(paths, layout.config, project).meta)]
  const checks: Record<string, CheckResult> = {}
  const lines: string[] = []
  for (const set of sets) {
    const named = set === DEFAULT_SET ? undefined : set
    const { rendered, result } = await freshCheck(paths, project, undefined, named)
    if (!result) return renderFailedOutcome(rendered, 'released')
    if (rendered && !named && settingsFor(paths, project).render.sheet) await sheetFor(paths, project, rendered)
    checks[set] = result
    lines.push(
      result.status === 'pass'
        ? `PASS  check  ${project}${named ? `  set ${named}` : ''}`
        : formatCheck(result, flags.all),
    )
  }
  const failed = Object.entries(checks).filter(([, r]) => r.status === 'fail')
  if (failed.length && !flags['accept-fail']) {
    lines.push(
      `  Not checkpointed or exported because the check failed${sets.length > 1 ? ` (${failed.map(([s]) => s).join(', ')})` : ''}.`,
      '  Fix the FAILs, or pass --accept-fail when the user accepted them and they are recorded under Decisions in brief.md.',
    )
    return { data: { checks, version: null, export: null }, text: lines.join('\n'), exitCode: 1 }
  }
  const version = checkpoint({ paths, project, message, force: flags.force })
  lines.push(
    `Checkpointed ${project} ${version.id}: ${message}`,
    ...version.parts.map((p) => `  ${p.id} ${formatBBox(p.bbox)}`),
  )
  const openscad = await resolveOpenscad(paths)
  const exported = await exportProject({ paths, project, openscad, formats, sets })
  lines.push(...formatExport(paths, project, exported))
  return {
    data: { checks, version, export: exported },
    text: lines.join('\n'),
    exitCode: exportFailed(exported) ? 1 : 0,
  }
}
