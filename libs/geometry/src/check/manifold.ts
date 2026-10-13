import type { Vec3 } from '@scad/protocol'
import { round } from '../mesh/math.ts'
import { collapsed, DEGENERATE_AREA, EDGE_KEY, edgeKey, type Topology } from '../mesh/topology.ts'
import { MAX_SAMPLES, reportVec } from './report.ts'

export const FOLD_ANGLE = 170
const COS_FOLD = Math.cos((FOLD_ANGLE * Math.PI) / 180)
const FOLD_CELL = 1

export const checkManifold = (topo: Topology) => {
  const n = topo.areas.length
  const undirected = new Map<number, number>()
  const directed = new Set<number>()
  let flippedEdges = 0
  let degenerate = 0
  for (let t = 0; t < n; t++) {
    if (collapsed(topo, t)) {
      degenerate++
      continue
    }
    if (topo.areas[t] <= DEGENERATE_AREA) degenerate++
    for (let k = 0; k < 3; k++) {
      const a = topo.tris[3 * t + k]
      const b = topo.tris[3 * t + ((k + 1) % 3)]
      const key = edgeKey(a, b)
      undirected.set(key, (undirected.get(key) ?? 0) + 1)
      const dir = a * EDGE_KEY + b
      if (directed.has(dir)) flippedEdges++
      else directed.add(dir)
    }
  }
  let openEdges = 0
  let nonManifoldEdges = 0
  const samples: Vec3[] = []
  for (const [key, count] of undirected) {
    if (count === 2) continue
    if (count === 1) openEdges++
    else nonManifoldEdges++
    if (samples.length < MAX_SAMPLES) {
      const a = Math.floor(key / EDGE_KEY)
      const b = key % EDGE_KEY
      samples.push(reportVec([0, 1, 2].map((j) => (topo.points[3 * a + j] + topo.points[3 * b + j]) / 2)))
    }
  }
  let foldedEdges = 0
  let foldedLength = 0
  const folds = new Map<string, Vec3>()
  for (const [key, list] of topo.edges) {
    const pair = list.filter((t) => !collapsed(topo, t))
    if (pair.length !== 2) continue
    const [p, q] = pair
    const n = topo.normals
    const d = n[3 * p] * n[3 * q] + n[3 * p + 1] * n[3 * q + 1] + n[3 * p + 2] * n[3 * q + 2]
    if (d >= COS_FOLD) continue
    const a = Math.floor(key / EDGE_KEY)
    const b = key % EDGE_KEY
    const mid = [0, 1, 2].map((j) => (topo.points[3 * a + j] + topo.points[3 * b + j]) / 2)
    foldedEdges++
    foldedLength += Math.hypot(...[0, 1, 2].map((j) => topo.points[3 * a + j] - topo.points[3 * b + j]))
    const cell = mid.map((x) => Math.round(x / FOLD_CELL)).join(',')
    if (!folds.has(cell) && folds.size < MAX_SAMPLES) folds.set(cell, reportVec(mid))
  }
  return {
    openEdges,
    nonManifoldEdges,
    flippedEdges,
    degenerate,
    samples,
    foldedEdges,
    foldedLength: round(foldedLength, 2),
    folds: [...folds.values()],
  }
}
