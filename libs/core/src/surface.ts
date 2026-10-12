import type { AnnotationEdge, BBox, Cylinder, Facet, Surface, Vec3 } from './protocol.ts'

export const FEATURE_ANGLE = 24
const PLANAR_ANGLE = 0.5
const COLLINEAR_ANGLE = 0.5
const AXIS_TOLERANCE = 0.05
const RADIUS_TOLERANCE = 0.02
const WELD = 1e4

const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180)
const COS_FEATURE = cosDeg(FEATURE_ANGLE)
const COS_PLANAR = cosDeg(PLANAR_ANGLE)
const COS_COLLINEAR = cosDeg(COLLINEAR_ANGLE)

export const round = (n: number, digits = 4) => {
  const f = 10 ** digits
  const r = Math.round(n * f) / f
  return Object.is(r, -0) ? 0 : r
}

const roundVec = (v: ArrayLike<number>): Vec3 => [round(v[0]), round(v[1]), round(v[2])]

export type Topology = {
  points: Float64Array
  tris: Uint32Array
  normals: Float64Array
  areas: Float64Array
  edges: Map<number, number[]>
  vertexTris: number[][]
}

const edgeKey = (a: number, b: number) => (a < b ? a * 0x200000 + b : b * 0x200000 + a)

export const buildTopology = (positions: ArrayLike<number>, index: ArrayLike<number> | null): Topology => {
  const vertexCount = positions.length / 3
  const triCount = index ? index.length / 3 : vertexCount / 3
  const remap = new Int32Array(vertexCount).fill(-1)
  const welded = new Map<string, number>()
  const coords: number[] = []
  const weld = (i: number) => {
    if (remap[i] >= 0) return remap[i]
    const x = positions[3 * i]
    const y = positions[3 * i + 1]
    const z = positions[3 * i + 2]
    const key = `${Math.round(x * WELD)},${Math.round(y * WELD)},${Math.round(z * WELD)}`
    let id = welded.get(key)
    if (id === undefined) {
      id = coords.length / 3
      coords.push(x, y, z)
      welded.set(key, id)
    }
    remap[i] = id
    return id
  }
  const tris = new Uint32Array(triCount * 3)
  for (let t = 0; t < triCount; t++)
    for (let k = 0; k < 3; k++) tris[3 * t + k] = weld(index ? index[3 * t + k] : 3 * t + k)
  const points = Float64Array.from(coords)
  const normals = new Float64Array(triCount * 3)
  const areas = new Float64Array(triCount)
  const edges = new Map<number, number[]>()
  const vertexTris: number[][] = Array.from({ length: points.length / 3 }, () => [])
  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]]
    const ux = points[3 * b] - points[3 * a]
    const uy = points[3 * b + 1] - points[3 * a + 1]
    const uz = points[3 * b + 2] - points[3 * a + 2]
    const vx = points[3 * c] - points[3 * a]
    const vy = points[3 * c + 1] - points[3 * a + 1]
    const vz = points[3 * c + 2] - points[3 * a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    areas[t] = len / 2
    if (len > 0) {
      normals[3 * t] = nx / len
      normals[3 * t + 1] = ny / len
      normals[3 * t + 2] = nz / len
    }
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = edgeKey(p, q)
      const list = edges.get(key)
      if (list) list.push(t)
      else edges.set(key, [t])
    }
    for (const v of [a, b, c]) vertexTris[v].push(t)
  }
  return { points, tris, normals, areas, edges, vertexTris }
}

export const point = (topo: Topology, v: number): Vec3 => [
  topo.points[3 * v],
  topo.points[3 * v + 1],
  topo.points[3 * v + 2],
]

const normal = (topo: Topology, t: number): Vec3 => [
  topo.normals[3 * t],
  topo.normals[3 * t + 1],
  topo.normals[3 * t + 2],
]

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => {
  const l = len(a)
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const triEdges = (topo: Topology, t: number): [number, number][] => {
  const [a, b, c] = [topo.tris[3 * t], topo.tris[3 * t + 1], topo.tris[3 * t + 2]]
  return [
    [a, b],
    [b, c],
    [c, a],
  ]
}

const neighbours = (topo: Topology, t: number) =>
  triEdges(topo, t).flatMap(([a, b]) => (topo.edges.get(edgeKey(a, b)) ?? []).filter((n) => n !== t))

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

const vertexSet = (topo: Topology, tris: number[]) => {
  const set = new Set<number>()
  for (const t of tris) for (let k = 0; k < 3; k++) set.add(topo.tris[3 * t + k])
  return [...set]
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
