import type { BBox, Facet, Surface, Vec3 } from '@scad/protocol'
import { cosDeg, dot, round, roundVec, sub } from '../mesh/math.ts'
import { neighbours, normal, type Topology, vertexSet } from '../mesh/topology.ts'
import { fitCylinder } from './cylinder.ts'

export const FEATURE_ANGLE = 24
const PLANAR_ANGLE = 0.5
export const COS_FEATURE = cosDeg(FEATURE_ANGLE)
const COS_PLANAR = cosDeg(PLANAR_ANGLE)

const grow = (topo: Topology, seed: number, accept: (from: number, to: number) => boolean) => {
  const seen = new Set([seed])
  const queue = [seed]
  while (queue.length) {
    const t = queue.pop() as number
    for (const n of neighbours(topo, t)) {
      if (seen.has(n) || topo.areas[n] === 0 || !accept(t, n)) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return [...seen]
}

const bboxOf = (topo: Topology, vertices: number[]): BBox => {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const v of vertices)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], topo.points[3 * v + i])
      max[i] = Math.max(max[i], topo.points[3 * v + i])
    }
  return { min: roundVec(min), max: roundVec(max), size: roundVec(sub(max, min)) }
}

const areaOf = (topo: Topology, tris: number[]) => tris.reduce((s, t) => s + topo.areas[t], 0)

const facetOf = (topo: Topology, seed: number, tris: number[]): Facet => ({
  normal: roundVec(normal(topo, seed)),
  area: round(areaOf(topo, tris)),
  bbox: bboxOf(topo, vertexSet(topo, tris)),
})

export const analyzeSurface = (topo: Topology, seed: number): Surface | null => {
  if (seed < 0 || seed >= topo.areas.length || topo.areas[seed] === 0) return null
  const seedNormal = normal(topo, seed)
  const facetTris = grow(topo, seed, (_from, to) => dot(normal(topo, to), seedNormal) >= COS_PLANAR)
  const regionTris = grow(topo, seed, (from, to) => dot(normal(topo, from), normal(topo, to)) >= COS_FEATURE)
  const facet = facetOf(topo, seed, facetTris)
  const base = {
    area: round(areaOf(topo, regionTris)),
    bbox: bboxOf(topo, vertexSet(topo, regionTris)),
    triangles: regionTris.length,
    facet,
  }
  if (regionTris.length === facetTris.length) return { type: 'planar', ...base }
  const cylinder = fitCylinder(topo, regionTris)
  return cylinder ? { type: 'cylindrical', ...base, cylinder } : { type: 'curved', ...base }
}
