import type { Island } from '@scad/protocol'
import { round } from '../mesh/math.ts'
import { collapsed, type Topology } from '../mesh/topology.ts'
import { BED_TOLERANCE } from './overhangs.ts'
import { reportBox, reportVec } from './report.ts'

const ISLAND_TOLERANCE = 0.01

export type IslandRegion = Island & { triangles: number[] }

export const findIslands = (topo: Topology, bedZ: number): IslandRegion[] => {
  const { points, tris, vertexTris } = topo
  const count = points.length / 3
  const seen = new Uint8Array(count)
  const out: IslandRegion[] = []
  for (let seed = 0; seed < count; seed++) {
    if (seen[seed] || !vertexTris[seed].length) continue
    seen[seed] = 1
    const z0 = points[3 * seed + 2]
    if (z0 <= bedZ + BED_TOLERANCE) continue
    const plateau = [seed]
    let minimum = true
    for (let i = 0; i < plateau.length; i++) {
      const v = plateau[i]
      for (const t of vertexTris[v]) {
        if (collapsed(topo, t)) continue
        for (let k = 0; k < 3; k++) {
          const u = tris[3 * t + k]
          const dz = points[3 * u + 2] - z0
          if (dz < -ISLAND_TOLERANCE) minimum = false
          else if (dz <= ISLAND_TOLERANCE && !seen[u]) {
            seen[u] = 1
            plateau.push(u)
          }
        }
      }
    }
    if (!minimum) continue
    const members = new Set(plateau)
    const triangles = [...new Set(plateau.flatMap((v) => vertexTris[v]))].filter((t) => !collapsed(topo, t))
    let facing = 0
    let area = 0
    for (const t of triangles) {
      facing += topo.areas[t] * topo.normals[3 * t + 2]
      if (members.has(tris[3 * t]) && members.has(tris[3 * t + 1]) && members.has(tris[3 * t + 2]))
        area += topo.areas[t]
    }
    if (facing >= 0) continue
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const center = [0, 0, 0]
    for (const v of plateau)
      for (let j = 0; j < 3; j++) {
        const x = points[3 * v + j]
        center[j] += x / plateau.length
        min[j] = Math.min(min[j], x)
        max[j] = Math.max(max[j], x)
      }
    out.push({
      center: reportVec(center),
      bbox: reportBox(min, max),
      height: round(z0 - bedZ, 3),
      area: round(area, 2),
      triangles,
    })
  }
  return out.sort((a, b) => a.height - b.height)
}
