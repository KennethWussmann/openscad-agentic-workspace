import type { Vec3 } from '@scad/protocol'
import { buildTopology, DEGENERATE_AREA, type Topology } from '../mesh/topology.ts'
import { buildBvh, nearestHit } from './bvh.ts'

const OPPOSING = -0.5

export const thicknessField = (topo: Topology) => {
  const n = topo.areas.length
  const out = new Float32Array(n).fill(Infinity)
  if (!n) return out
  const bvh = buildBvh(topo)
  const { points, tris, normals } = topo
  for (let t = 0; t < n; t++) {
    if (topo.areas[t] <= DEGENERATE_AREA) continue
    const nx = normals[3 * t]
    const ny = normals[3 * t + 1]
    const nz = normals[3 * t + 2]
    const o: Vec3 = [0, 0, 0]
    for (let k = 0; k < 3; k++)
      o[k] = (points[3 * tris[3 * t] + k] + points[3 * tris[3 * t + 1] + k] + points[3 * tris[3 * t + 2] + k]) / 3
    const { distance, triangle } = nearestHit(topo, bvh, o, [-nx, -ny, -nz], t)
    if (triangle < 0) continue
    const facing = normals[3 * triangle] * nx + normals[3 * triangle + 1] * ny + normals[3 * triangle + 2] * nz
    if (facing <= OPPOSING) out[t] = distance
  }
  return out
}

export const thicknessOfMesh = (positions: ArrayLike<number>, index: ArrayLike<number> | null) =>
  thicknessField(buildTopology(positions, index))
