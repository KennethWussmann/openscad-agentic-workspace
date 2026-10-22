import { MathUtils } from 'three'
import { expect, it } from 'vitest'
import { FOV, fitDistanceFor } from './rig.ts'

it('fits by the vertical field of view on wide viewports', () => {
  const expected = (10 / Math.sin(MathUtils.degToRad(FOV / 2))) * 1.15
  expect(fitDistanceFor(10, 16 / 9)).toBeCloseTo(expected)
  expect(fitDistanceFor(10, 1)).toBeCloseTo(expected)
})

it('backs off on portrait viewports so the model fits the width', () => {
  const half = Math.atan(Math.tan(MathUtils.degToRad(FOV / 2)) * 0.5)
  expect(fitDistanceFor(10, 0.5)).toBeCloseTo((10 / Math.sin(half)) * 1.15)
  expect(fitDistanceFor(10, 0.5)).toBeGreaterThan(fitDistanceFor(10, 1))
})
