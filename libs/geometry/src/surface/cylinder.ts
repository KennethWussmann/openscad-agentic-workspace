import type { Cylinder, Vec3 } from '@scad/protocol'
import { cross, dot, round, roundVec, unit } from '../mesh/math.ts'
import { normal, point, type Topology, vertexSet } from '../mesh/topology.ts'

const AXIS_TOLERANCE = 0.05
const RADIUS_TOLERANCE = 0.02

const symmetricEigen = (m: number[][]) => {
  const a = m.map((r) => [...r])
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2
    if (off < 1e-20) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-30) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p]
        const akq = a[k][q]
        a[k][p] = c * akp - s * akq
        a[k][q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k]
        const aqk = a[q][k]
        a[p][k] = c * apk - s * aqk
        a[q][k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p]
        const vkq = v[k][q]
        v[k][p] = c * vkp - s * vkq
        v[k][q] = s * vkp + c * vkq
      }
    }
  }
  return [0, 1, 2]
    .map((i) => ({ value: a[i][i], vector: [v[0][i], v[1][i], v[2][i]] as Vec3 }))
    .sort((x, y) => x.value - y.value)
}

const canonicalAxis = (a: Vec3): Vec3 => {
  const i = [0, 1, 2].reduce((best, k) => (Math.abs(a[k]) > Math.abs(a[best]) ? k : best), 0)
  return a[i] < 0 ? [-a[0], -a[1], -a[2]] : a
}

export const fitCylinder = (topo: Topology, tris: number[]): Cylinder | null => {
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const t of tris) {
    const n = normal(topo, t)
    const w = topo.areas[t]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += w * n[i] * n[j]
  }
  const axis = canonicalAxis(unit(symmetricEigen(m)[0].vector))
  if (tris.some((t) => Math.abs(dot(normal(topo, t), axis)) > AXIS_TOLERANCE)) return null
  const helper: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = unit(cross(axis, helper))
  const v = cross(axis, u)
  let sw = 0
  let snx = 0
  let sny = 0
  let snn = 0
  let scx = 0
  let scy = 0
  let snc = 0
  const angles: number[] = []
  for (const t of tris) {
    const w = topo.areas[t]
    const n = normal(topo, t)
    const nx = dot(n, u)
    const ny = dot(n, v)
    const [a, b, c] = [0, 1, 2].map((k) => point(topo, topo.tris[3 * t + k]))
    const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    const cx = dot(centroid, u)
    const cy = dot(centroid, v)
    sw += w
    snx += w * nx
    sny += w * ny
    snn += w * (nx * nx + ny * ny)
    scx += w * cx
    scy += w * cy
    snc += w * (nx * cx + ny * cy)
    angles.push(Math.atan2(ny, nx))
  }
  const det = sw * (sw * snn - sny * sny) - snx * snx * sw
  if (Math.abs(det) < 1e-12) return null
  const s = (sw * (sw * snc - sny * scy) - snx * sw * scx) / det
  const px = (scx - s * snx) / sw
  const py = (scy - s * sny) / sw
  const vertices = vertexSet(topo, tris)
  const radial = vertices.map((i) => {
    const p = point(topo, i)
    return Math.hypot(dot(p, u) - px, dot(p, v) - py)
  })
  const radius = radial.reduce((x, y) => x + y, 0) / radial.length
  if (!(radius > 0)) return null
  const rms = Math.sqrt(radial.reduce((x, r) => x + (r - radius) ** 2, 0) / radial.length)
  if (rms / radius > RADIUS_TOLERANCE) return null
  const distinct = angles.sort((x, y) => x - y).filter((x, i, all) => i === 0 || x - all[i - 1] > 1e-3)
  let gap = 2 * Math.PI - (distinct[distinct.length - 1] - distinct[0])
  for (let i = 1; i < distinct.length; i++) gap = Math.max(gap, distinct[i] - distinct[i - 1])
  const spanned = ((2 * Math.PI - gap) * 180) / Math.PI
  const arc = distinct.length > 1 ? Math.min(360, (spanned * distinct.length) / (distinct.length - 1)) : 0
  const along = vertices.map((i) => dot(point(topo, i), axis))
  const lo = Math.min(...along)
  const hi = Math.max(...along)
  const mid = (lo + hi) / 2
  const center: Vec3 = [0, 1, 2].map((k) => px * u[k] + py * v[k] + mid * axis[k]) as Vec3
  return {
    axis: roundVec(axis),
    center: roundVec(center),
    radius: round(radius),
    length: round(hi - lo),
    arc: round(arc, 1),
    concave: s < 0,
  }
}
