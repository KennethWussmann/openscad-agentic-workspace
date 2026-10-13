import { Vector3 } from 'three'
import { expect, it } from 'vitest'
import { fitsBed, gridLines, gridSteps } from './bed.ts'

it('coarsens the grid for larger models', () => {
  expect(gridSteps(50)).toEqual([1, 10])
  expect(gridSteps(200)).toEqual([5, 50])
  expect(gridSteps(1000)).toEqual([10, 100])
})

it('draws grid lines and skips the major ones', () => {
  const all = gridLines({ x0: 0, x1: 2, y0: 0, y1: 2 }, 1, 0)
  expect(all.getAttribute('position').count).toBe(12)
  const minor = gridLines({ x0: 0, x1: 20, y0: 0, y1: 0 }, 1, 10)
  const xs = Array.from(minor.getAttribute('position').array).filter((_, i) => i % 6 === 0)
  expect(xs).not.toContain(10)
  expect(xs).toContain(9)
})

it('checks the bed fit in both orientations', () => {
  expect(fitsBed(new Vector3(200, 100, 50), [256, 256, 256])).toBe(true)
  expect(fitsBed(new Vector3(150, 250, 10), [250, 150, 100])).toBe(true)
  expect(fitsBed(new Vector3(300, 10, 10), [256, 256, 256])).toBe(false)
  expect(fitsBed(new Vector3(10, 10, 300), [256, 256, 256])).toBe(false)
})
