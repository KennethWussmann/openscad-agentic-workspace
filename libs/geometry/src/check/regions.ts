import type { CheckRegion } from '@scad/protocol'
import { round } from '../mesh/math.ts'
import { edgeKey, type Topology, triBounds } from '../mesh/topology.ts'
import { MAX_REGIONS, reportBox, reportVec } from './report.ts'

export const WORST_PATCH_AREA = 0.1

type Grouped = { regions: CheckRegion[]; area: number; worst: number | null }

export const groupRegions = (
  topo: Topology,
  flagged: Uint8Array,
  value: ArrayLike<number>,
  mode: 'max' | 'min',
  minArea: number,
): Grouped => {
  const n = flagged.length
  const seen = new Uint8Array(n)
  const all: CheckRegion[] = []
  for (let seed = 0; seed < n; seed++) {
    if (!flagged[seed] || seen[seed]) continue
    seen[seed] = 1
    const queue = [seed]
    let area = 0
    const members: number[] = []
    const center = [0, 0, 0]
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    while (queue.length) {
      const t = queue.pop() as number
      const w = topo.areas[t]
      area += w
      members.push(t)
      for (let j = 0; j < 3; j++) {
        const c =
          (topo.points[3 * topo.tris[3 * t] + j] +
            topo.points[3 * topo.tris[3 * t + 1] + j] +
            topo.points[3 * topo.tris[3 * t + 2] + j]) /
          3
        center[j] += c * w
      }
      triBounds(topo, t, min, max)
      for (let k = 0; k < 3; k++) {
        const a = topo.tris[3 * t + k]
        const b = topo.tris[3 * t + ((k + 1) % 3)]
        for (const m of topo.edges.get(edgeKey(a, b)) ?? [])
          if (flagged[m] && !seen[m]) {
            seen[m] = 1
            queue.push(m)
          }
      }
    }
    members.sort((a, b) => (mode === 'max' ? value[b] - value[a] : value[a] - value[b]))
    const patch = Math.min(WORST_PATCH_AREA, area)
    let covered = 0
    let worst = value[members[0]]
    for (const t of members) {
      covered += topo.areas[t]
      worst = value[t]
      if (covered >= patch) break
    }
    all.push({
      area: round(area, 2),
      bbox: reportBox(min, max),
      center: reportVec(area > 0 ? center.map((c) => c / area) : min),
      worst: round(worst, mode === 'max' ? 1 : 3),
      triangles: members.length,
    })
  }
  const kept = all.filter((r) => r.area >= minArea).sort((a, b) => b.area - a.area)
  const worst = kept.length
    ? mode === 'max'
      ? Math.max(...kept.map((r) => r.worst))
      : Math.min(...kept.map((r) => r.worst))
    : null
  return {
    regions: kept.slice(0, MAX_REGIONS),
    area: round(
      kept.reduce((s, r) => s + r.area, 0),
      2,
    ),
    worst,
  }
}
