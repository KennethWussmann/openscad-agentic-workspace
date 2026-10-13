import { buildTopology, featureEdges } from '@scad/geometry'
import type { Vec3 } from '@scad/protocol'
import { read3mf } from '../mesh/model3mf.ts'

export type Segment = [Vec3, Vec3]

export const OUTLINE_COLOR = '#0b0e12'
const MAX_SEGMENTS = 30000
const WIDTH_PER_EXTENT = 1 / 300

export const modelOutlines = (models: string[]): Segment[] => {
  const segments = models.flatMap((m) => {
    const mesh = read3mf(m)
    return featureEdges(buildTopology(mesh.positions, mesh.index))
  })
  return segments.length > MAX_SEGMENTS ? [] : segments
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const scaled = (v: Vec3, s: number): Vec3 => {
  const l = Math.hypot(...v) || 1
  return [(v[0] / l) * s, (v[1] / l) * s, (v[2] / l) * s]
}

const BOX_FACES = [
  [0, 1, 2, 3],
  [7, 6, 5, 4],
  [0, 4, 5, 1],
  [1, 5, 6, 2],
  [2, 6, 7, 3],
  [3, 7, 4, 0],
]

const fmt = (n: number) => Number(n.toFixed(4))

const extentOf = (segments: Segment[]) => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const s of segments)
    for (const p of s)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i])
        max[i] = Math.max(max[i], p[i])
      }
  return Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1)
}

export const outlineSource = (segments: Segment[]) => {
  if (!segments.length) return ''
  const extent = extentOf(segments)
  const half = (extent * WIDTH_PER_EXTENT) / 2
  const points: string[] = []
  const faces: string[] = []
  for (const [a, b] of segments) {
    const dir: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const helper: Vec3 = Math.abs(dir[2]) < 0.9 * Math.hypot(...dir) ? [0, 0, 1] : [1, 0, 0]
    const u = scaled(cross(dir, helper), half)
    const v = scaled(cross(dir, u), half)
    const base = points.length
    for (const end of [a, b])
      for (const [su, sv] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ])
        points.push(`[${[0, 1, 2].map((i) => fmt(end[i] + su * u[i] + sv * v[i])).join(',')}]`)
    for (const f of BOX_FACES) faces.push(`[${f.map((i) => i + base).join(',')}]`)
  }
  return `color(${JSON.stringify(OUTLINE_COLOR)}) polyhedron(\n  points = [${points.join(',')}],\n  faces = [${faces.join(',')}]\n);\n`
}
