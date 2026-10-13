import type { FdmProfile, ResinProfile } from '@scad/protocol'
import { describe, expect, it } from 'vitest'
import { fine, formatProfile, formatTolerances } from './profile.ts'

const fdm: FdmProfile = {
  printer: 'h2c',
  process: 'fdm',
  bed: [300, 320, 320],
  layerHeight: 0.2,
  minWall: 0.8,
  minRegionArea: 1,
  nozzle: 0.4,
  nozzles: [0.4],
  overhangAngle: 45,
  tolerances: { press: 0.025, sliding: 0.075, loose: 0.15, hole: 0.2 },
}

const resin: ResinProfile = {
  printer: 'mars',
  process: 'resin',
  bed: [143, 89, 175],
  layerHeight: 0.025,
  minWall: 0.8,
  minRegionArea: 1,
  pixel: 0.035,
  minFeature: 0.3,
  drainHole: 2.5,
  tolerances: { press: 0.05, sliding: 0.1, loose: 0.2, hole: 0.1 },
}

describe('fine', () => {
  it('keeps three decimals and drops trailing zeros', () => {
    expect(fine(0.025)).toBe('0.025')
    expect(fine(0.2)).toBe('0.2')
    expect(fine(0)).toBe('0')
    expect(fine(20)).toBe('20')
  })
})

describe('formatTolerances', () => {
  it('prints calibrated values without rounding them to two decimals', () => {
    expect(formatTolerances(fdm)).toBe(
      'press 0.025, sliding 0.075, loose 0.15 mm per side; holes +0.2 mm on the diameter',
    )
  })
})

describe('formatProfile', () => {
  it('prints resin pixel size and layer height without rounding', () => {
    expect(formatProfile(resin)).toContain('layer 0.025 mm, pixel 0.035 mm')
  })
})
