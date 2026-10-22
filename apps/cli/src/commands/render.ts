import {
  generateCover,
  isDirty,
  listVersions,
  loadProjectConfig,
  readRender,
  requireProject,
  requireSet,
  validateSets,
} from '@scad/core'
import { type Ctx, need, type Outcome, partsFlag, settingsFor } from '../context.ts'
import { formatDiagnostic, table } from '../format/common.ts'
import { formatRender } from '../format/render.ts'
import { formatSetIssues, formatValues } from '../format/sets.ts'
import { viewerUrl } from '../server.ts'
import { renderViaServerOrLocal, sheetFor } from './rendering.ts'

export const render = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const { meta } = loadProjectConfig(paths, layout.config, project)
  const set = flags.set ? requireSet(meta, flags.set) : null
  const { result, server } = await renderViaServerOrLocal(paths, project, partsFlag(flags), set?.name)
  const setIssues = validateSets(meta, result.params)
  if (!server && !set && result.status === 'ok') await generateCover(paths, project, result)
  const wantSheet = flags.sheet ?? settingsFor(paths, project).render.sheet
  const sheet = wantSheet && result.parts.some((p) => p.model) ? await sheetFor(paths, project, result) : null
  const dirty = isDirty(paths, project)
  const latest = listVersions(paths, project).at(-1)
  const data = {
    ...result,
    sheet: sheet?.sheet ?? null,
    sheetDiagnostics: sheet?.diagnostics ?? [],
    viewer: server ? viewerUrl(server.port, project) : null,
    latestVersion: latest?.id ?? null,
    changedSinceVersion: dirty,
    setIssues,
  }
  const lines = [formatRender(result)]
  if (set) lines.push(`  set ${set.name}: ${formatValues(set.def.values)}`)
  lines.push(...formatSetIssues(setIssues))
  if (sheet?.sheet) lines.push(`  sheet: ${sheet.sheet}  (2x2: iso | front / right | top)`)
  for (const d of sheet?.diagnostics ?? []) lines.push(`  sheet ${formatDiagnostic(d)}`)
  lines.push(
    `  version: ${latest ? `${latest.id}${dirty ? ' + uncheckpointed changes' : ' (unchanged)'}` : 'none yet'}`,
  )
  if (server) lines.push(`  viewer: ${viewerUrl(server.port, project)}`)
  return { data, text: lines.join('\n'), exitCode: result.status === 'ok' ? 0 : 1 }
}

export const params = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const result = readRender(paths, project) ?? (await renderViaServerOrLocal(paths, project)).result
  const rows = [['GROUP', 'NAME', 'VALUE', 'UNIT', 'RANGE / OPTIONS', 'CAPTION']]
  for (const p of result.params)
    rows.push([
      p.group ?? '',
      p.name,
      JSON.stringify(p.initial),
      p.unit ?? '',
      p.options
        ? p.options.map((o) => JSON.stringify(o.value)).join('|')
        : p.min !== undefined || p.max !== undefined
          ? `${p.min ?? ''}..${p.max ?? ''}${p.step ? ` step ${p.step}` : ''}`
          : '',
      p.caption ?? '',
    ])
  return { data: result.params, text: result.params.length ? table(rows) : 'No customizer parameters found.' }
}
