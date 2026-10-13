import type { AnnotationEdge, Vec3 } from '@scad/protocol'
import { cosDeg, dot, len, round, roundVec, sub, unit } from '../mesh/math.ts'
import { EDGE_KEY, edgeKey, normal, point, type Topology, triEdges } from '../mesh/topology.ts'
import { COS_FEATURE } from './surface.ts'

const COLLINEAR_ANGLE = 0.5
const COS_COLLINEAR = cosDeg(COLLINEAR_ANGLE)

const isFeature = (topo: Topology, a: number, b: number) => {
  const tris = topo.edges.get(edgeKey(a, b)) ?? []
  return tris.length !== 2 || dot(normal(topo, tris[0]), normal(topo, tris[1])) < COS_FEATURE
}

export const featureEdgesNear = (topo: Topology, seed: number): [number, number][] => {
  const candidates = new Set<number>([seed])
  for (let k = 0; k < 3; k++) for (const t of topo.vertexTris[topo.tris[3 * seed + k]]) candidates.add(t)
  const found = new Map<number, [number, number]>()
  for (const t of candidates)
    for (const [a, b] of triEdges(topo, t)) if (isFeature(topo, a, b)) found.set(edgeKey(a, b), [a, b])
  return [...found.values()]
}

const continueEdge = (topo: Topology, from: number, at: number, seen: Set<number>) => {
  const dir = unit(sub(point(topo, at), point(topo, from)))
  for (const t of topo.vertexTris[at])
    for (const [a, b] of triEdges(topo, t)) {
      if (a !== at && b !== at) continue
      const next = a === at ? b : a
      if (next === from || seen.has(next) || !isFeature(topo, at, next)) continue
      if (dot(unit(sub(point(topo, next), point(topo, at))), dir) >= COS_COLLINEAR) return next
    }
  return null
}

export const describeEdge = (topo: Topology, a: number, b: number): AnnotationEdge => {
  const seen = new Set([a, b])
  const walk = (from: number, at: number) => {
    let prev = from
    let current = at
    for (let next = continueEdge(topo, prev, current, seen); next !== null; ) {
      seen.add(next)
      prev = current
      current = next
      next = continueEdge(topo, prev, current, seen)
    }
    return current
  }
  const start = walk(b, a)
  const end = walk(a, b)
  const tris = topo.edges.get(edgeKey(a, b)) ?? []
  let angle = 0
  let convex = false
  if (tris.length === 2) {
    const n1 = normal(topo, tris[0])
    angle = (Math.acos(Math.max(-1, Math.min(1, dot(n1, normal(topo, tris[1]))))) * 180) / Math.PI
    const opposite = [0, 1, 2].map((k) => topo.tris[3 * tris[1] + k]).find((v) => v !== a && v !== b) as number
    convex = dot(sub(point(topo, opposite), point(topo, a)), n1) < 0
  }
  const pa = point(topo, start)
  const pb = point(topo, end)
  return { a: roundVec(pa), b: roundVec(pb), length: round(len(sub(pb, pa))), angle: round(angle, 1), convex }
}

export const featureEdges = (topo: Topology): [Vec3, Vec3][] => {
  const out: [Vec3, Vec3][] = []
  for (const key of topo.edges.keys()) {
    const a = Math.floor(key / EDGE_KEY)
    const b = key % EDGE_KEY
    if (isFeature(topo, a, b)) out.push([point(topo, a), point(topo, b)])
  }
  return out
}
