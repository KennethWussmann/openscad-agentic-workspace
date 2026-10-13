import { Vector3 } from 'three'
import { expect, it } from 'vitest'
import type { SectionState } from '../../store/store.ts'
import { axisIndex, freeHandle, updateSectionPlane } from './plane.ts'

const section = (patch: Partial<SectionState>): SectionState => ({
  enabled: true,
  axis: 'x',
  offset: 0,
  flip: false,
  caps: true,
  gizmo: 'translate',
  ...patch,
})

it('keeps everything below the offset on an axis', () => {
  const plane = updateSectionPlane(section({ axis: 'z', offset: 5 }))
  expect(plane.distanceToPoint(new Vector3(0, 0, 2))).toBeGreaterThan(0)
  expect(plane.distanceToPoint(new Vector3(0, 0, 8))).toBeLessThan(0)
})

it('flips the kept side', () => {
  const plane = updateSectionPlane(section({ axis: 'y', offset: 1, flip: true }))
  expect(plane.distanceToPoint(new Vector3(0, 3, 0))).toBeGreaterThan(0)
  expect(plane.distanceToPoint(new Vector3(0, 0, 0))).toBeLessThan(0)
})

it('follows the free handle', () => {
  freeHandle.position.set(0, 0, 4)
  freeHandle.quaternion.identity()
  const plane = updateSectionPlane(section({ axis: 'free' }))
  expect(plane.normal.toArray()).toEqual([0, 0, -1])
  expect(plane.distanceToPoint(new Vector3(0, 0, 0))).toBeCloseTo(4)
})

it('maps axes to indices', () => {
  expect(['x', 'y', 'z'].map((a) => axisIndex(a as 'x' | 'y' | 'z'))).toEqual([0, 1, 2])
})
