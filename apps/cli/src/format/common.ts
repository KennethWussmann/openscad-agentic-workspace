import type { BBox, Diagnostic } from '@scad/protocol'

export const num = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '')

export const vec = (v: number[]) => `(${v.map(num).join(', ')})`

export const formatBox = (b: BBox) => `${vec(b.min)}..${vec(b.max)}, size ${b.size.map(num).join(' x ')}`

export const formatBBox = (b: BBox | null) =>
  b ? `${b.size.map(num).join(' x ')} mm  (min ${b.min.map(num).join(', ')} / max ${b.max.map(num).join(', ')})` : '-'

export const formatDiagnostic = (d: Diagnostic) =>
  `${d.level.toUpperCase()}${d.file ? ` ${d.file}${d.line ? `:${d.line}` : ''}` : ''}: ${d.message}`

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
