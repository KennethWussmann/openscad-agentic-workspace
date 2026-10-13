import { exportProject, requireProject, resolveOpenscad } from '@scad/core'
import { EXPORT_FORMATS, type ExportFormat } from '@scad/protocol'
import { type Ctx, need, type Outcome, partsFlag, rel, UsageError } from '../context.ts'
import { formatDiagnostic } from '../format/common.ts'
import { checkHint } from './check.ts'

export const exportCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const formats = flags.formats?.split(',').map((f) => f.trim()) as ExportFormat[] | undefined
  const bad = formats?.filter((f) => !EXPORT_FORMATS.includes(f))
  if (bad?.length) throw new UsageError(`Unknown format(s) ${bad.join(', ')}. Use ${EXPORT_FORMATS.join(', ')}`)
  const openscad = await resolveOpenscad(paths)
  const result = await exportProject({ paths, project, openscad, formats, parts: partsFlag(flags) })
  const failed = result.files.filter((f) => !f.ok)
  const lines = [`Exported ${project} (${result.version}) to ${rel(paths, result.outDir)}`]
  for (const f of result.files) {
    lines.push(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.part} ${f.format.padEnd(8)} ${f.file}`)
    if (!f.ok)
      for (const d of f.diagnostics.filter((d) => d.level === 'error')) lines.push(`       ${formatDiagnostic(d)}`)
  }
  if (result.version === 'wip')
    lines.push('  note: the export does not match a checkpoint; checkpoint first to tie files to a version')
  const hint = checkHint(paths, project)
  if (hint.message) lines.push(`  note: ${hint.message}`)
  return { data: { ...result, check: hint }, text: lines.join('\n'), exitCode: failed.length ? 1 : 0 }
}
