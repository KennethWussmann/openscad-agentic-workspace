import type { Vec3 } from '@scad/protocol'
import type { Topology } from '../mesh/topology.ts'

const LEAF_SIZE = 4
const RAY_EPS = 1e-7

export type Bvh = {
  bounds: Float64Array
  child: Int32Array
  start: Int32Array
  count: Int32Array
  order: Uint32Array
}

export const buildBvh = (topo: Topology): Bvh => {
  const n = topo.areas.length
  const { points, tris } = topo
  const centroid = new Float64Array(n * 3)
  const triMin = new Float64Array(n * 3)
  const triMax = new Float64Array(n * 3)
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 3; k++) {
      const a = points[3 * tris[3 * t] + k]
      const b = points[3 * tris[3 * t + 1] + k]
      const c = points[3 * tris[3 * t + 2] + k]
      centroid[3 * t + k] = (a + b + c) / 3
      triMin[3 * t + k] = Math.min(a, b, c)
      triMax[3 * t + k] = Math.max(a, b, c)
    }
  const capacity = Math.max(1, 2 * n)
  const bvh: Bvh = {
    bounds: new Float64Array(capacity * 6),
    child: new Int32Array(capacity).fill(-1),
    start: new Int32Array(capacity),
    count: new Int32Array(capacity),
    order: Uint32Array.from({ length: n }, (_, i) => i),
  }
  const { order } = bvh
  let nodes = 1
  const stack: [number, number, number][] = [[0, 0, n]]
  while (stack.length) {
    const [node, start, end] = stack.pop() as [number, number, number]
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    const clo = [Infinity, Infinity, Infinity]
    const chi = [-Infinity, -Infinity, -Infinity]
    for (let i = start; i < end; i++) {
      const t = order[i]
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], triMin[3 * t + k])
        hi[k] = Math.max(hi[k], triMax[3 * t + k])
        clo[k] = Math.min(clo[k], centroid[3 * t + k])
        chi[k] = Math.max(chi[k], centroid[3 * t + k])
      }
    }
    bvh.bounds.set([...lo, ...hi], node * 6)
    bvh.start[node] = start
    bvh.count[node] = end - start
    if (end - start <= LEAF_SIZE) continue
    const extent = [chi[0] - clo[0], chi[1] - clo[1], chi[2] - clo[2]]
    const axis = extent[0] >= extent[1] && extent[0] >= extent[2] ? 0 : extent[1] >= extent[2] ? 1 : 2
    if (extent[axis] < 1e-12) continue
    const mid = (clo[axis] + chi[axis]) / 2
    let i = start
    let j = end - 1
    while (i <= j) {
      if (centroid[3 * order[i] + axis] < mid) i++
      else {
        const tmp = order[i]
        order[i] = order[j]
        order[j--] = tmp
      }
    }
    const split = i === start || i === end ? (start + end) >> 1 : i
    const left = nodes
    nodes += 2
    bvh.child[node] = left
    stack.push([left, start, split], [left + 1, split, end])
  }
  return bvh
}

export const nearestHit = (topo: Topology, bvh: Bvh, o: Vec3, d: Vec3, skip: number) => {
  const { points, tris } = topo
  const inv = d.map((x) => (Math.abs(x) < 1e-12 ? (x < 0 ? -1e12 : 1e12) : 1 / x))
  let best = Infinity
  let hit = -1
  const stack = [0]
  while (stack.length) {
    const node = stack.pop() as number
    const b = node * 6
    let tmin = 0
    let tmax = best
    for (let k = 0; k < 3; k++) {
      const t1 = (bvh.bounds[b + k] - o[k]) * inv[k]
      const t2 = (bvh.bounds[b + 3 + k] - o[k]) * inv[k]
      tmin = Math.max(tmin, Math.min(t1, t2))
      tmax = Math.min(tmax, Math.max(t1, t2))
    }
    if (tmin > tmax) continue
    const child = bvh.child[node]
    if (child >= 0) {
      stack.push(child, child + 1)
      continue
    }
    for (let i = bvh.start[node], end = i + bvh.count[node]; i < end; i++) {
      const t = bvh.order[i]
      if (t === skip) continue
      const a = 3 * tris[3 * t]
      const p1 = 3 * tris[3 * t + 1]
      const p2 = 3 * tris[3 * t + 2]
      const e1x = points[p1] - points[a]
      const e1y = points[p1 + 1] - points[a + 1]
      const e1z = points[p1 + 2] - points[a + 2]
      const e2x = points[p2] - points[a]
      const e2y = points[p2 + 1] - points[a + 1]
      const e2z = points[p2 + 2] - points[a + 2]
      const px = d[1] * e2z - d[2] * e2y
      const py = d[2] * e2x - d[0] * e2z
      const pz = d[0] * e2y - d[1] * e2x
      const det = e1x * px + e1y * py + e1z * pz
      if (Math.abs(det) < 1e-14) continue
      const f = 1 / det
      const sx = o[0] - points[a]
      const sy = o[1] - points[a + 1]
      const sz = o[2] - points[a + 2]
      const u = (sx * px + sy * py + sz * pz) * f
      if (u < 0 || u > 1) continue
      const qx = sy * e1z - sz * e1y
      const qy = sz * e1x - sx * e1z
      const qz = sx * e1y - sy * e1x
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * f
      if (v < 0 || u + v > 1) continue
      const dist = (e2x * qx + e2y * qy + e2z * qz) * f
      if (dist > RAY_EPS && dist < best) {
        best = dist
        hit = t
      }
    }
  }
  return { distance: best, triangle: hit }
}
