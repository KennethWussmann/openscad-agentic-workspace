import type { Vec3 } from '@scad/protocol'
import { describe, expect, it } from 'vitest'
import { analyzeSurface, buildTopology, describeEdge, featureEdgesNear, point } from '../index.ts'

type Tri = [Vec3, Vec3, Vec3]

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]

const grid = (origin: Vec3, du: Vec3, dv: Vec3, n: number): Tri[] => {
  const tris: Tri[] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const p = add(add(origin, du, i / n), dv, j / n)
      const pu = add(p, du, 1 / n)
      const pv = add(p, dv, 1 / n)
      const puv = add(pu, dv, 1 / n)
      tris.push([p, pu, puv], [p, puv, pv])
    }
  return tris
}

const box = ([x, y, z]: Vec3, n = 1): Tri[] => [
  ...grid([0, 0, 0], [0, y, 0], [x, 0, 0], n),
  ...grid([0, 0, z], [x, 0, 0], [0, y, 0], n),
  ...grid([0, 0, 0], [x, 0, 0], [0, 0, z], n),
  ...grid([0, y, 0], [0, 0, z], [x, 0, 0], n),
  ...grid([0, 0, 0], [0, 0, z], [0, y, 0], n),
  ...grid([x, 0, 0], [0, y, 0], [0, 0, z], n),
]

const cylinder = (center: Vec3, r: number, h: number, sides: number, inward = false): Tri[] => {
  const ring = (z: number) =>
    Array.from({ length: sides }, (_, i): Vec3 => {
      const a = (2 * Math.PI * i) / sides
      return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a), z]
    })
  const bottom = ring(center[2])
  const top = ring(center[2] + h)
  const tris: Tri[] = []
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    tris.push([bottom[i], bottom[j], top[j]], [bottom[i], top[j], top[i]])
    tris.push([[center[0], center[1], center[2] + h], top[i], top[j]])
    tris.push([center, bottom[j], bottom[i]])
  }
  return inward ? tris.map(([a, b, c]) => [a, c, b]) : tris
}

const topologyOf = (tris: Tri[]) => buildTopology(tris.flat(2), null)

const findTri = (tris: Tri[], test: (normal: Vec3, centroid: Vec3) => boolean) =>
  tris.findIndex(([a, b, c]) => {
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const l = Math.hypot(...n)
    return test(
      [n[0] / l, n[1] / l, n[2] / l],
      [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    )
  })

describe('surface analysis', () => {
  it('welds shared vertices of an unindexed mesh', () => {
    const topo = topologyOf(box([10, 20, 5]))
    expect(topo.points.length / 3).toBe(8)
    expect(topo.areas.length).toBe(12)
  })

  it('reports a box face as planar with its area and extent', () => {
    const tris = box([10, 20, 5], 3)
    const top = findTri(tris, (n) => n[2] > 0.99)
    const surface = analyzeSurface(topologyOf(tris), top)
    expect(surface?.type).toBe('planar')
    expect(surface?.area).toBeCloseTo(200)
    expect(surface?.bbox).toEqual({ min: [0, 0, 5], max: [10, 20, 5], size: [10, 20, 0] })
    expect(surface?.facet.normal).toEqual([0, 0, 1])
    expect(surface?.cylinder).toBeUndefined()
  })

  it('fits a convex cylinder to the wall of a boss', () => {
    const tris = cylinder([5, 5, 0], 4, 12, 48)
    const wall = findTri(tris, (n) => Math.abs(n[2]) < 0.01)
    const surface = analyzeSurface(topologyOf(tris), wall)
    expect(surface?.type).toBe('cylindrical')
    expect(surface?.cylinder?.axis).toEqual([0, 0, 1])
    expect(surface?.cylinder?.radius).toBeCloseTo(4, 3)
    expect(surface?.cylinder?.center).toEqual([5, 5, 6])
    expect(surface?.cylinder?.length).toBeCloseTo(12)
    expect(surface?.cylinder?.arc).toBe(360)
    expect(surface?.cylinder?.concave).toBe(false)
    expect(surface?.facet.area).toBeLessThan(surface?.area ?? 0)
  })

  it('marks an inward facing cylinder as a hole', () => {
    const tris = cylinder([0, 0, 0], 1.6, 8, 32, true)
    const wall = findTri(tris, (n) => Math.abs(n[2]) < 0.01)
    const surface = analyzeSurface(topologyOf(tris), wall)
    expect(surface?.type).toBe('cylindrical')
    expect(surface?.cylinder?.radius).toBeCloseTo(1.6, 3)
    expect(surface?.cylinder?.concave).toBe(true)
  })

  it('finds feature edges and extends split edges to their full length', () => {
    const tris = box([30, 10, 6], 3)
    const topo = topologyOf(tris)
    const seed = findTri(tris, (n, c) => n[2] > 0.99 && c[1] < 2 && c[0] > 10 && c[0] < 20)
    const edges = featureEdgesNear(topo, seed)
    const front = edges.find(([a, b]) => point(topo, a)[1] === 0 && point(topo, b)[1] === 0 && point(topo, a)[2] === 6)
    expect(front).toBeDefined()
    const [a, b] = front as [number, number]
    const edge = describeEdge(topo, a, b)
    expect(edge.length).toBeCloseTo(30)
    expect([edge.a[0], edge.b[0]].sort((x, y) => x - y)).toEqual([0, 30])
    expect(edge.angle).toBeCloseTo(90)
    expect(edge.convex).toBe(true)
  })

  it('returns null for degenerate seeds', () => {
    const topo = topologyOf([
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ],
    ])
    expect(analyzeSurface(topo, 0)).toBeNull()
  })
})
