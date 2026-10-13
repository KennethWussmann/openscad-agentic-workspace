import { Vector3 } from 'three'
import { expect, it } from 'vitest'
import { extentOf, toVec3 } from './vec.ts'

it('uses the largest side of the bounds as extent, at least 10', () => {
  expect(
    extentOf([
      [0, 0, 0],
      [40, 20, 5],
    ]),
  ).toBe(40)
  expect(
    extentOf([
      [0, 0, 0],
      [2, 3, 1],
    ]),
  ).toBe(10)
  expect(extentOf(null)).toBe(100)
})

it('converts three vectors to rounded tuples', () => {
  const v = toVec3(new Vector3(1.0000001, 2, -3))
  expect(v).toHaveLength(3)
  expect(v[0]).toBeCloseTo(1)
  expect(v[2]).toBe(-3)
})
