import { describe, expect, it } from 'vitest'
import { type MeshData, renderCover } from '../index.ts'

const cube = (size: number, color: number): MeshData => {
  const v = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].flatMap((z) => [x * size, y * size, z * size])))
  const quads = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ]
  const index = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])
  return { positions: Float64Array.from(v), index: Uint32Array.from(index), colors: new Int32Array(12).fill(color) }
}

describe('renderCover', () => {
  it('draws the model opaque, a soft shadow translucent and the rest transparent', () => {
    const png = renderCover([cube(20, 0xcc3322)], { width: 160, height: 120, samples: 2 })
    expect(png).not.toBeNull()
    const alpha = (x: number, y: number) => png?.data[(y * 160 + x) * 4 + 3] ?? -1
    expect(alpha(80, 55)).toBe(255)
    expect(alpha(1, 1)).toBe(0)
    const shadow = Array.from({ length: 160 * 120 }, (_, i) => png?.data[i * 4 + 3] ?? 0).filter(
      (a) => a > 0 && a < 255,
    )
    expect(shadow.length).toBeGreaterThan(100)
    const o = (55 * 160 + 80) * 4
    expect(png?.data[o]).toBeGreaterThan(png?.data[o + 2] ?? 0)
  })

  it('returns null without geometry', () => {
    expect(
      renderCover([{ positions: new Float64Array(), index: new Uint32Array(), colors: new Int32Array() }]),
    ).toBeNull()
  })
})
