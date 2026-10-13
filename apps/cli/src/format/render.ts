import type { RenderResult } from '@scad/protocol'
import { formatBBox, formatDiagnostic } from './common.ts'

export const formatRender = (r: RenderResult) => {
  const lines = [`${r.status === 'ok' ? 'OK' : 'FAILED'}  ${r.project}  ${r.durationMs} ms`]
  if (r.error) lines.push(`  ERROR: ${r.error}`)
  for (const p of r.parts) {
    lines.push(
      `  part ${p.id}${p.label ? ` (${p.label})` : ''}: ${p.status}${p.stale ? ', showing last good model' : ''}  ${p.file}`,
    )
    if (p.status === 'ok') lines.push(`    size ${formatBBox(p.bbox)}  facets ${p.facets ?? '-'}`)
    const echoes = p.diagnostics.filter((d) => d.level === 'echo')
    for (const d of p.diagnostics.filter((d) => d.level !== 'echo')) lines.push(`    ${formatDiagnostic(d)}`)
    for (const d of echoes.slice(0, 20)) lines.push(`    ECHO: ${d.message}`)
    if (echoes.length > 20) lines.push(`    ... ${echoes.length - 20} more ECHO lines`)
  }
  if (r.params.length)
    lines.push(`  params: ${r.params.map((p) => `${p.name}=${JSON.stringify(p.initial)}`).join(', ')}`)
  return lines.join('\n')
}
