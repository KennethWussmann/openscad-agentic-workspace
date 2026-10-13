import { describe, expect, it } from 'vitest'
import { noteNumber, stemLength, summarize, tipOf } from './placement.ts'

const bbox = {
  min: [0, 0, 0] as [number, number, number],
  max: [1, 1, 1] as [number, number, number],
  size: [1, 1, 1] as [number, number, number],
}
const facet = { normal: [0, 0, 1] as [number, number, number], area: 1, bbox }

it('pads note numbers', () => {
  expect(noteNumber(3)).toBe('03')
  expect(noteNumber(12)).toBe('12')
})

it('places the balloon tip along the normal, at least 2 mm out', () => {
  expect(stemLength(10)).toBe(2)
  expect(stemLength(100)).toBeCloseTo(7)
  expect(tipOf([1, 2, 3], [0, 0, 1], 100)).toEqual([1, 2, 3 + stemLength(100)])
})

describe('summarize', () => {
  it('describes edges', () => {
    expect(
      summarize({
        kind: 'edge',
        edge: { a: [0, 0, 0], b: [1, 0, 0], length: 12, angle: 90, convex: true },
        surface: null,
      }),
    ).toBe('edge 12.00 mm, 90.00° convex')
  })

  it('describes holes and bosses', () => {
    const cylinder = {
      axis: [0, 0, 1] as [number, number, number],
      center: [0, 0, 0] as [number, number, number],
      radius: 1.5,
      length: 4,
      arc: 360,
      concave: true,
    }
    const surface = { type: 'cylindrical' as const, area: 10, bbox, triangles: 20, facet, cylinder }
    expect(summarize({ kind: 'face', surface })).toBe('hole Ø3.00 × 4.00')
    expect(summarize({ kind: 'vertex', surface: { ...surface, cylinder: { ...cylinder, concave: false } } })).toBe(
      'corner of boss Ø3.00 × 4.00',
    )
  })

  it('describes flat and curved faces and falls back to the kind', () => {
    expect(summarize({ kind: 'face', surface: { type: 'planar', area: 25, bbox, triangles: 2, facet } })).toBe(
      'flat face 25.00 mm²',
    )
    expect(summarize({ kind: 'face', surface: { type: 'curved', area: 25, bbox, triangles: 2, facet } })).toBe(
      'curved surface',
    )
    expect(summarize({ kind: 'vertex', surface: null })).toBe('vertex')
  })
})
