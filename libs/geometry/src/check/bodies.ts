import type { Body } from '@scad/protocol'
import { round } from '../mesh/math.ts'
import { collapsed, type Topology, triBounds } from '../mesh/topology.ts'
import { reportBox } from './report.ts'

export const findBodies = (topo: Topology) => {
  const parent = Int32Array.from({ length: topo.points.length / 3 }, (_, i) => i)
  const find = (x: number) => {
    let r = x
    while (parent[r] !== r) r = parent[r]
    while (parent[x] !== r) {
      const next = parent[x]
      parent[x] = r
      x = next
    }
    return r
  }
  const n = topo.areas.length
  for (let t = 0; t < n; t++) {
    if (collapsed(topo, t)) continue
    const a = find(topo.tris[3 * t])
    parent[find(topo.tris[3 * t + 1])] = a
    parent[find(topo.tris[3 * t + 2])] = a
  }
  const groups = new Map<number, { volume: number; triangles: number; min: number[]; max: number[] }>()
  const p = topo.points
  for (let t = 0; t < n; t++) {
    if (collapsed(topo, t)) continue
    const root = find(topo.tris[3 * t])
    let g = groups.get(root)
    if (!g) {
      g = { volume: 0, triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
      groups.set(root, g)
    }
    const a = 3 * topo.tris[3 * t]
    const b = 3 * topo.tris[3 * t + 1]
    const c = 3 * topo.tris[3 * t + 2]
    g.volume +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
        p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6
    g.triangles++
    triBounds(topo, t, g.min, g.max)
  }
  return [...groups.values()].map(
    (g): Body => ({ bbox: reportBox(g.min, g.max), volume: round(g.volume, 3), triangles: g.triangles }),
  )
}
