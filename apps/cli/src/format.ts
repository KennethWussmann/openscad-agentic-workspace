import type { BBox, Diagnostic, RenderResult } from '@scad/core'

const num = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '')

export const formatBBox = (b: BBox | null) =>
  b ? `${b.size.map(num).join(' x ')} mm  (min ${b.min.map(num).join(', ')} / max ${b.max.map(num).join(', ')})` : '-'

export const formatDiagnostic = (d: Diagnostic) =>
  `${d.level.toUpperCase()}${d.file ? ` ${d.file}${d.line ? `:${d.line}` : ''}` : ''}: ${d.message}`

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

export const table = (rows: string[][]) => {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? []
  return rows
    .map((r) =>
      r
        .map((c, i) => c.padEnd(widths[i]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}
