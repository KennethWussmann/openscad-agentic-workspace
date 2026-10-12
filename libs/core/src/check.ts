import type {
  BBox,
  BedCheck,
  BodiesCheck,
  Body,
  CheckRegion,
  CheckStatus,
  Island,
  IslandCheck,
  ManifoldCheck,
  PartCheck,
  PrintProfile,
  RegionCheck,
  Vec3,
} from './protocol.ts'
import { buildTopology, round, type Topology } from './surface.ts'

export const BED_TOLERANCE = 0.01
export const BED_FACE = -1
const BED_NORMAL = -0.999
const DEGENERATE_AREA = 1e-9
const OPPOSING = -0.5
export const FOLD_ANGLE = 170
const COS_FOLD = Math.cos((FOLD_ANGLE * Math.PI) / 180)
const FOLD_CELL = 1
const ANGLE_TOLERANCE = 0.01
const THICKNESS_TOLERANCE = 1e-3
const FLOAT_TOLERANCE = 0.05
const ISLAND_TOLERANCE = 0.01
const MAX_REGIONS = 20
export const WORST_PATCH_AREA = 0.1
const MAX_SAMPLES = 10
const LEAF_SIZE = 4
const RAY_EPS = 1e-7
const KEY = 0x200000

const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 }

export const worstStatus = (statuses: CheckStatus[]): CheckStatus =>
  statuses.reduce<CheckStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'pass')

const roundVec = (v: ArrayLike<number>, digits = 3): Vec3 => [
  round(v[0], digits),
  round(v[1], digits),
  round(v[2], digits),
]

const boxOf = (min: ArrayLike<number>, max: ArrayLike<number>): BBox => ({
  min: roundVec(min),
  max: roundVec(max),
  size: roundVec([max[0] - min[0], max[1] - min[1], max[2] - min[2]]),
})

export const wallLimits = (profile: PrintProfile) => ({
  fail: profile.process === 'fdm' ? profile.nozzle : profile.minFeature,
  warn: profile.minWall,
})

export const overhangAngle = (nz: number) => (nz >= 0 ? 0 : (Math.asin(Math.min(1, -nz)) * 180) / Math.PI)

export const overhangField = (positions: ArrayLike<number>, index: ArrayLike<number> | null, bedZ: number) => {
  const count = index ? index.length / 3 : positions.length / 9
  const out = new Float32Array(count)
  const v = (t: number, k: number) => (index ? index[3 * t + k] : 3 * t + k)
  for (let t = 0; t < count; t++) {
    const a = 3 * v(t, 0)
    const b = 3 * v(t, 1)
    const c = 3 * v(t, 2)
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const z = nz / len
    const onBed =
      z < BED_NORMAL &&
      positions[a + 2] <= bedZ + BED_TOLERANCE &&
      positions[b + 2] <= bedZ + BED_TOLERANCE &&
      positions[c + 2] <= bedZ + BED_TOLERANCE
    out[t] = onBed ? BED_FACE : overhangAngle(z)
  }
  return out
}

type Bvh = {
  bounds: Float64Array
  child: Int32Array
  start: Int32Array
  count: Int32Array
  order: Uint32Array
}

const buildBvh = (topo: Topology): Bvh => {
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

const nearestHit = (topo: Topology, bvh: Bvh, o: Vec3, d: Vec3, skip: number) => {
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

const collapsed = (topo: Topology, t: number) => {
  const a = topo.tris[3 * t]
  const b = topo.tris[3 * t + 1]
  const c = topo.tris[3 * t + 2]
  return a === b || b === c || c === a
}

const triBounds = (topo: Topology, t: number, min: number[], max: number[]) => {
  for (let k = 0; k < 3; k++)
    for (let j = 0; j < 3; j++) {
      const x = topo.points[3 * topo.tris[3 * t + k] + j]
      if (x < min[j]) min[j] = x
      if (x > max[j]) max[j] = x
    }
}

type Grouped = { regions: CheckRegion[]; area: number; worst: number | null }

const groupRegions = (
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
        for (const m of topo.edges.get(a < b ? a * KEY + b : b * KEY + a) ?? [])
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
      bbox: boxOf(min, max),
      center: roundVec(area > 0 ? center.map((c) => c / area) : min),
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

const checkManifold = (topo: Topology) => {
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
      const key = a < b ? a * KEY + b : b * KEY + a
      undirected.set(key, (undirected.get(key) ?? 0) + 1)
      const dir = a * KEY + b
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
      const a = Math.floor(key / KEY)
      const b = key % KEY
      samples.push(roundVec([0, 1, 2].map((j) => (topo.points[3 * a + j] + topo.points[3 * b + j]) / 2)))
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
    const a = Math.floor(key / KEY)
    const b = key % KEY
    const mid = [0, 1, 2].map((j) => (topo.points[3 * a + j] + topo.points[3 * b + j]) / 2)
    foldedEdges++
    foldedLength += Math.hypot(...[0, 1, 2].map((j) => topo.points[3 * a + j] - topo.points[3 * b + j]))
    const cell = mid.map((x) => Math.round(x / FOLD_CELL)).join(',')
    if (!folds.has(cell) && folds.size < MAX_SAMPLES) folds.set(cell, roundVec(mid))
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

const findBodies = (topo: Topology) => {
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
    (g): Body => ({ bbox: boxOf(g.min, g.max), volume: round(g.volume, 3), triangles: g.triangles }),
  )
}

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
      center: roundVec(center),
      bbox: boxOf(min, max),
      height: round(z0 - bedZ, 3),
      area: round(area, 2),
      triangles,
    })
  }
  return out.sort((a, b) => a.height - b.height)
}

const checkBed = (bbox: BBox | null, bed: Vec3): BedCheck => {
  const size: Vec3 = bbox?.size ?? [0, 0, 0]
  const within = (x: number, y: number) => x <= bed[0] + 1e-6 && y <= bed[1] + 1e-6 && size[2] <= bed[2] + 1e-6
  const fits = within(size[0], size[1])
  const fitsRotated = within(size[1], size[0])
  const minZ = bbox?.min[2] ?? 0
  const status: CheckStatus = !fits && !fitsRotated ? 'fail' : !fits || Math.abs(minZ) > BED_TOLERANCE ? 'warn' : 'pass'
  return { status, size, bed, fits, fitsRotated, minZ }
}

export type MeshAnalysis = Omit<PartCheck, 'id' | 'label' | 'durationMs'>

export const analyzeMesh = (
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  profile: PrintProfile,
): MeshAnalysis => {
  const topo = buildTopology(positions, index)
  const n = topo.areas.length
  let bbox: BBox | null = null
  if (topo.points.length) {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < topo.points.length; i += 3)
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], topo.points[i + j])
        max[j] = Math.max(max[j], topo.points[i + j])
      }
    bbox = boxOf(min, max)
  }
  const bedZ = bbox?.min[2] ?? 0

  const edges = checkManifold(topo)
  const bodies = findBodies(topo)
  const solids = bodies.filter((b) => b.volume > 0)
  const inverted = bodies.length > 0 && solids.length === 0
  const manifold: ManifoldCheck = {
    status:
      edges.openEdges || edges.nonManifoldEdges || edges.flippedEdges || inverted
        ? 'fail'
        : edges.foldedEdges
          ? 'warn'
          : 'pass',
    ...edges,
    inverted,
  }

  let overhangs: RegionCheck | null = null
  let islands: IslandCheck | null = null
  if (profile.process === 'fdm') {
    const angles = overhangField(topo.points, topo.tris, bedZ)
    const steep = new Uint8Array(n)
    for (let t = 0; t < n; t++) steep[t] = angles[t] > profile.overhangAngle + ANGLE_TOLERANCE ? 1 : 0
    const over = groupRegions(topo, steep, angles, 'max', profile.minRegionArea)
    overhangs = { status: over.regions.length ? 'warn' : 'pass', ...over }
  } else {
    const found = findIslands(topo, bedZ)
    islands = {
      status: found.length ? 'warn' : 'pass',
      count: found.length,
      islands: found.slice(0, MAX_REGIONS).map(({ triangles: _, ...island }) => island),
    }
  }

  const limits = wallLimits(profile)
  const thickness = thicknessField(topo)
  const thin = new Uint8Array(n)
  for (let t = 0; t < n; t++) thin[t] = thickness[t] < limits.warn - THICKNESS_TOLERANCE ? 1 : 0
  const slim = groupRegions(topo, thin, thickness, 'min', profile.minRegionArea)
  const walls: RegionCheck = {
    status: slim.worst === null ? 'pass' : slim.worst < limits.fail - THICKNESS_TOLERANCE ? 'fail' : 'warn',
    ...slim,
  }

  const floating = solids.filter((b) => b.bbox.min[2] > bedZ + FLOAT_TOLERANCE)
  const small = solids.filter((b) => Math.max(...b.bbox.size) < limits.warn)
  const voids = bodies.length - solids.length
  const bodyCheck: BodiesCheck = {
    status: floating.length || small.length || (profile.process === 'resin' && voids) ? 'warn' : 'pass',
    bodies: solids.length,
    voids,
    floating: floating.slice(0, MAX_REGIONS),
    small: small.slice(0, MAX_REGIONS),
  }

  const bed = checkBed(bbox, profile.bed)
  return {
    status: worstStatus(
      [manifold.status, bed.status, overhangs?.status, islands?.status, walls.status, bodyCheck.status].filter(
        (x): x is CheckStatus => x !== undefined,
      ),
    ),
    triangles: n,
    bbox,
    manifold,
    bed,
    overhangs,
    islands,
    walls,
    bodies: bodyCheck,
  }
}
