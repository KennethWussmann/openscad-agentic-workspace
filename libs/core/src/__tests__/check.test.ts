import { describe, expect, it } from 'vitest'
import { analyzeMesh, BED_FACE, overhangField, thicknessOfMesh, worstStatus } from '../check.ts'
import type { CheckSettings, Vec3 } from '../protocol.ts'

type Mesh = { positions: number[]; index: number[] }

const SETTINGS: CheckSettings = { bed: [256, 256, 256], nozzle: 0.4, overhangAngle: 45, minWall: 0.8, minRegionArea: 1 }

const QUADS = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
]

const box = (min: Vec3, max: Vec3): Mesh => {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const index = QUADS.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])
  return { positions, index }
}

const merge = (...meshes: Mesh[]): Mesh => {
  const positions: number[] = []
  const index: number[] = []
  for (const m of meshes) {
    const base = positions.length / 3
    positions.push(...m.positions)
    index.push(...m.index.map((i) => i + base))
  }
  return { positions, index }
}

const analyze = (m: Mesh, settings: Partial<CheckSettings> = {}) =>
  analyzeMesh(m.positions, m.index, { ...SETTINGS, ...settings })

describe('analyzeMesh', () => {
  it('passes a plain cube on the bed', () => {
    const r = analyze(box([0, 0, 0], [20, 20, 20]))
    expect(r.status).toBe('pass')
    expect(r.triangles).toBe(12)
    expect(r.bbox?.size).toEqual([20, 20, 20])
    expect(r.manifold).toMatchObject({ status: 'pass', openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 })
    expect(r.overhangs.regions).toEqual([])
    expect(r.walls.regions).toEqual([])
    expect(r.bodies).toMatchObject({ bodies: 1, voids: 0, floating: [], small: [] })
  })

  it('fails open meshes and reports where the holes are', () => {
    const m = box([0, 0, 0], [10, 10, 10])
    m.index.splice(3, 3)
    const r = analyze(m)
    expect(r.manifold.status).toBe('fail')
    expect(r.manifold.openEdges).toBe(3)
    expect(r.manifold.samples.length).toBe(3)
    expect(r.status).toBe('fail')
  })

  it('fails flipped faces and inside-out meshes', () => {
    const flipped = box([0, 0, 0], [10, 10, 10])
    ;[flipped.index[1], flipped.index[2]] = [flipped.index[2], flipped.index[1]]
    expect(analyze(flipped).manifold).toMatchObject({ status: 'fail', flippedEdges: 3 })
    const inverted = box([0, 0, 0], [10, 10, 10])
    for (let i = 0; i < inverted.index.length; i += 3)
      [inverted.index[i + 1], inverted.index[i + 2]] = [inverted.index[i + 2], inverted.index[i + 1]]
    expect(analyze(inverted).manifold).toMatchObject({ status: 'fail', inverted: true, flippedEdges: 0 })
  })

  it('fails non-manifold edges where two solids share an edge', () => {
    const r = analyze(merge(box([0, 0, 0], [10, 10, 10]), box([10, 10, 0], [20, 20, 10])))
    expect(r.manifold.nonManifoldEdges).toBe(1)
    expect(r.manifold.status).toBe('fail')
  })

  it('warns about zero-thickness fins', () => {
    const m = box([0, 0, 0], [10, 10, 10])
    const base = m.positions.length / 3
    m.positions.push(10, 0, 10, 10, 10, 10, 15, 5, 10.0001)
    const fin = [base, base + 1, base + 2]
    const r = analyzeMesh(m.positions, m.index, SETTINGS)
    expect(r.manifold.foldedEdges).toBe(0)
    const withFin = analyzeMesh([...m.positions], [...m.index, ...fin, fin[0], fin[2], fin[1]], SETTINGS)
    expect(withFin.manifold.foldedEdges).toBeGreaterThan(0)
    expect(withFin.manifold.folds.length).toBeGreaterThan(0)
  })

  it('checks the bed size, the rotated fit and the bed contact', () => {
    expect(analyze(box([0, 0, 0], [300, 10, 10])).bed).toMatchObject({
      status: 'fail',
      fits: false,
      fitsRotated: false,
    })
    expect(analyze(box([0, 0, 0], [220, 100, 10]), { bed: [200, 250, 200] }).bed).toMatchObject({
      status: 'warn',
      fits: false,
      fitsRotated: true,
    })
    expect(analyze(box([0, 0, 5], [10, 10, 15])).bed).toMatchObject({ status: 'warn', fits: true, minZ: 5 })
  })

  it('finds overhangs, ignores the bed and flags floating bodies', () => {
    const r = analyze(merge(box([0, 0, 0], [10, 10, 10]), box([20, 0, 5], [30, 10, 15])))
    expect(r.overhangs.status).toBe('warn')
    expect(r.overhangs.regions).toHaveLength(1)
    expect(r.overhangs.regions[0]).toMatchObject({ area: 100, worst: 90, center: [25, 5, 5], triangles: 2 })
    expect(r.bodies.bodies).toBe(2)
    expect(r.bodies.floating).toHaveLength(1)
    expect(r.bodies.floating[0].bbox.min).toEqual([20, 0, 5])
    expect(r.bodies.status).toBe('warn')
  })

  it('drops overhang regions below minRegionArea', () => {
    const r = analyze(merge(box([0, 0, 0], [10, 10, 10]), box([20, 0, 5], [20.5, 0.5, 5.5])))
    expect(r.overhangs.regions).toEqual([])
    expect(r.bodies.small).toHaveLength(1)
  })

  it('warns on walls under minWall and fails under the nozzle', () => {
    const warn = analyze(box([0, 0, 0], [20, 20, 0.6]))
    expect(warn.walls.status).toBe('warn')
    expect(warn.walls.worst).toBeCloseTo(0.6, 3)
    expect(warn.walls.regions.map((r) => r.area)).toEqual([400, 400])
    expect(warn.walls.area).toBe(800)
    const fail = analyze(box([0, 0, 0], [20, 20, 0.3]))
    expect(fail.walls.status).toBe('fail')
    expect(fail.walls.worst).toBeCloseTo(0.3, 3)
    expect(fail.status).toBe('fail')
  })

  it('measures the wall of a hollow box and counts the void', () => {
    const outer = box([0, 0, 0], [20, 20, 20])
    const inner = box([0.5, 0.5, 0.5], [19.5, 19.5, 19.5])
    for (let i = 0; i < inner.index.length; i += 3)
      [inner.index[i + 1], inner.index[i + 2]] = [inner.index[i + 2], inner.index[i + 1]]
    const r = analyze(merge(outer, inner))
    expect(r.manifold.status).toBe('pass')
    expect(r.bodies).toMatchObject({ bodies: 1, voids: 1 })
    expect(r.walls.worst).toBeCloseTo(0.5, 3)
    expect(r.walls.status).toBe('warn')
  })
})

describe('fields', () => {
  it('marks bed faces and measures angles from vertical', () => {
    const m = box([0, 0, 0], [10, 10, 10])
    const field = overhangField(m.positions, m.index, 0)
    expect([...field.slice(0, 2)]).toEqual([BED_FACE, BED_FACE])
    expect([...field.slice(2)].every((a) => a === 0)).toBe(true)
    expect(overhangField(m.positions, m.index, -1)[0]).toBeCloseTo(90)
  })

  it('computes per-triangle thickness from non-indexed positions', () => {
    const m = box([0, 0, 0], [10, 10, 2])
    const flat = m.index.flatMap((i) => m.positions.slice(3 * i, 3 * i + 3))
    const thickness = thicknessOfMesh(flat, null)
    expect(thickness[0]).toBeCloseTo(2)
    expect(thickness[4]).toBeCloseTo(10)
  })

  it('ranks statuses', () => {
    expect(worstStatus([])).toBe('pass')
    expect(worstStatus(['pass', 'warn'])).toBe('warn')
    expect(worstStatus(['warn', 'fail', 'pass'])).toBe('fail')
  })
})
