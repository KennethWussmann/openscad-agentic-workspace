import { checkpoint, isDirty, listVersions, requireProject, restoreFiles } from '@scad/core'
import { type Ctx, need, type Outcome, settingsFor } from '../context.ts'
import { formatBBox, table } from '../format/common.ts'
import { formatRender } from '../format/render.ts'
import { checkHint } from './check.ts'
import { renderViaServerOrLocal, sheetFor } from './rendering.ts'

export const checkpointCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const message = need(flags.message, '--message (-m)')
  const version = checkpoint({ paths, project, message, force: flags.force })
  const hint = checkHint(paths, project)
  return {
    data: { ...version, check: hint },
    text: `Checkpointed ${project} ${version.id}: ${message}\n  ${version.parts.map((p) => `${p.id} ${formatBBox(p.bbox)}`).join('\n  ')}${hint.message ? `\n  note: ${hint.message}` : ''}`,
  }
}

export const versions = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const list = listVersions(paths, project)
  const rows = [['VERSION', 'CREATED', 'MESSAGE']]
  for (const v of list)
    rows.push([
      v.id,
      v.createdAt.replace('T', ' ').slice(0, 16),
      `${v.message}${v.restoredFrom ? ` (from ${v.restoredFrom})` : ''}`,
    ])
  const dirty = list.length > 0 && isDirty(paths, project)
  return {
    data: { versions: list, changedSinceLatest: dirty },
    text: list.length
      ? `${table(rows)}${dirty ? '\n(working copy has changes after the latest version)' : ''}`
      : 'No versions yet.',
  }
}

export const restore = async (ctx: Ctx): Promise<Outcome> => {
  const { paths, flags, args } = ctx
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const ref = need(args[1], 'version (e.g. v003)')
  const restored = restoreFiles(paths, project, ref, flags['with-libs'])
  const { result } = await renderViaServerOrLocal(paths, project)
  const lines = [`Restored ${restored.version.id} (${restored.version.message}) into src/`]
  if (restored.libsRestored.length) lines.push(`  restored shared libs: ${restored.libsRestored.join(', ')}`)
  if (restored.libsDiffer.length)
    lines.push(
      `  WARNING: shared libs changed since ${restored.version.id}: ${restored.libsDiffer.join(', ')}`,
      '  The model may differ from the snapshot. Re-run with --with-libs to restore them (affects other projects).',
    )
  if (result.status !== 'ok') {
    lines.push(formatRender(result), '  Not checkpointed because the render failed.')
    return { data: { restored, render: result, version: null }, text: lines.join('\n'), exitCode: 1 }
  }
  const settings = settingsFor(paths, project)
  if (settings.render.sheet) await sheetFor(paths, project, result)
  const version = checkpoint({
    paths,
    project,
    message: `Restore ${restored.version.id}: ${restored.version.message}`,
    restoredFrom: restored.version.id,
    force: true,
  })
  lines.push(`  checkpointed as ${version.id}`)
  return { data: { restored, render: result, version }, text: lines.join('\n') }
}
