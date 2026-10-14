import { exportProject, loadProjectConfig, type Paths, requireProject, requireSet, resolveOpenscad } from '@scad/core'
import { ALL_SETS, DEFAULT_SET, EXPORT_FORMATS, type ExportFormat, type ExportResult } from '@scad/protocol'
import { type Ctx, type Flags, need, type Outcome, partsFlag, rel, UsageError } from '../context.ts'
import { formatDiagnostic } from '../format/common.ts'
import { checkHint } from './check.ts'

export const exportFailed = (result: ExportResult) => result.files.some((f) => !f.ok)

export const formatExport = (paths: Paths, project: string, result: ExportResult) => {
  const named = result.sets.some((s) => s !== DEFAULT_SET)
  const lines = [
    `Exported ${project} (${result.version})${named ? ` sets ${result.sets.join(', ')}` : ''} to ${rel(paths, result.outDir)}`,
  ]
  for (const f of result.files) {
    lines.push(`  ${f.ok ? 'ok  ' : 'FAIL'} ${named ? `${f.set} ` : ''}${f.part} ${f.format.padEnd(8)} ${f.file}`)
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

export const parseSets = (paths: Paths, project: string, flags: Flags) => {
  if (flags.set && flags.sets) throw new UsageError('Use either --set <name> or --sets <a,b|all>')
  const { meta } = loadProjectConfig(paths, requireProject(paths, project).config, project)
  const names = flags.set
    ? [flags.set]
    : (flags.sets
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [DEFAULT_SET])
  const expanded = names.flatMap((n) => (n === ALL_SETS ? [DEFAULT_SET, ...Object.keys(meta.sets)] : [n]))
  for (const name of expanded) if (name !== DEFAULT_SET) requireSet(meta, name)
  return [...new Set(expanded)]
}

export const exportCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const formats = parseFormats(flags)
  const sets = parseSets(paths, project, flags)
  const openscad = await resolveOpenscad(paths)
  const result = await exportProject({ paths, project, openscad, formats, parts: partsFlag(flags), sets })
  const hints = sets.map((s) => checkHint(paths, project, s === DEFAULT_SET ? undefined : s))
  const lines = formatExport(paths, project, result)
  for (const hint of hints) if (hint.message) lines.push(`  note: ${hint.message}`)
  return {
    data: { ...result, checks: Object.fromEntries(sets.map((s, i) => [s, hints[i]])) },
    text: lines.join('\n'),
    exitCode: exportFailed(result) ? 1 : 0,
  }
}
