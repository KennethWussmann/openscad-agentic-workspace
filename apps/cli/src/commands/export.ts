import { exportProject, type Paths, requireProject, resolveOpenscad } from '@scad/core'
import { EXPORT_FORMATS, type ExportFormat, type ExportResult } from '@scad/protocol'
import { type Ctx, type Flags, need, type Outcome, partsFlag, rel, UsageError } from '../context.ts'
import { formatDiagnostic } from '../format/common.ts'
import { checkHint } from './check.ts'

export const exportFailed = (result: ExportResult) => result.files.some((f) => !f.ok)

export const formatExport = (paths: Paths, project: string, result: ExportResult) => {
  const lines = [`Exported ${project} (${result.version}) to ${rel(paths, result.outDir)}`]
  for (const f of result.files) {
    lines.push(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.part} ${f.format.padEnd(8)} ${f.file}`)
    if (!f.ok)
      for (const d of f.diagnostics.filter((d) => d.level === 'error')) lines.push(`       ${formatDiagnostic(d)}`)
  }
  if (result.version === 'wip')
    lines.push('  note: the export does not match a checkpoint; checkpoint first to tie files to a version')
  return lines
}

export const parseFormats = (flags: Flags) => {
  const formats = flags.formats?.split(',').map((f) => f.trim()) as ExportFormat[] | undefined
  const bad = formats?.filter((f) => !EXPORT_FORMATS.includes(f))
  if (bad?.length) throw new UsageError(`Unknown format(s) ${bad.join(', ')}. Use ${EXPORT_FORMATS.join(', ')}`)
  return formats
}

export const exportCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const formats = parseFormats(flags)
  const openscad = await resolveOpenscad(paths)
  const result = await exportProject({ paths, project, openscad, formats, parts: partsFlag(flags) })
  const hint = checkHint(paths, project)
  const lines = formatExport(paths, project, result)
  if (hint.message) lines.push(`  note: ${hint.message}`)
  return { data: { ...result, check: hint }, text: lines.join('\n'), exitCode: exportFailed(result) ? 1 : 0 }
}
