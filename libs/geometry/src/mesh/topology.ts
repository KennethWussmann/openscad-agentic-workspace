import type { Vec3 } from '@scad/protocol'

const WELD = 1e4
export const EDGE_KEY = 0x200000
export const DEGENERATE_AREA = 1e-9

export type Topology = {
  points: Float64Array
  tris: Uint32Array
  normals: Float64Array
  areas: Float64Array
  edges: Map<number, number[]>
  vertexTris: number[][]
}

export const edgeKey = (a: number, b: number) => (a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a)

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

export const normal = (topo: Topology, t: number): Vec3 => [
  topo.normals[3 * t],
  topo.normals[3 * t + 1],
  topo.normals[3 * t + 2],
]

export const triEdges = (topo: Topology, t: number): [number, number][] => {
  const [a, b, c] = [topo.tris[3 * t], topo.tris[3 * t + 1], topo.tris[3 * t + 2]]
  return [
    [a, b],
    [b, c],
    [c, a],
  ]
}

export const neighbours = (topo: Topology, t: number) =>
  triEdges(topo, t).flatMap(([a, b]) => (topo.edges.get(edgeKey(a, b)) ?? []).filter((n) => n !== t))

export const vertexSet = (topo: Topology, tris: number[]) => {
  const set = new Set<number>()
  for (const t of tris) for (let k = 0; k < 3; k++) set.add(topo.tris[3 * t + k])
  return [...set]
}

export const collapsed = (topo: Topology, t: number) => {
  const a = topo.tris[3 * t]
  const b = topo.tris[3 * t + 1]
  const c = topo.tris[3 * t + 2]
  return a === b || b === c || c === a
}

export const triBounds = (topo: Topology, t: number, min: number[], max: number[]) => {
  for (let k = 0; k < 3; k++)
    for (let j = 0; j < 3; j++) {
      const x = topo.points[3 * topo.tris[3 * t + k] + j]
      if (x < min[j]) min[j] = x
      if (x > max[j]) max[j] = x
    }
}
