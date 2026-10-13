import { BED_FACE } from '@scad/geometry'
import { Box3, BoxGeometry, Color, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { fdmProfile } from '../../test/fixtures.ts'
import type { LoadedModel } from '../model/loader.ts'
import { HEAT, overhangColor, paint, triangleAreas, triangleCount, wallColor } from './heat.ts'
import { overhangs } from './overhangs.ts'

const model = (geometry: BoxGeometry, box: Box3): LoadedModel => ({
  key: 'm',
  box,
  meshes: [{ id: 'main', geometry, edges: geometry, color: new Color('#fff'), isDefaultColor: true }],
})

describe('colors', () => {
  it('colors overhangs by angle past the threshold', () => {
    expect(overhangColor(BED_FACE, 45)).toBe(HEAT.bed)
    expect(overhangColor(30, 45)).toBe(HEAT.neutral)
    expect(overhangColor(90, 45).getHex()).toBe(HEAT.red.getHex())
  })

  it('colors walls by the printer limits', () => {
    const s = fdmProfile({ nozzle: 0.4, minWall: 0.8 })
    expect(wallColor(0.3, s)).toBe(HEAT.red)
    expect(wallColor(5, s)).toBe(HEAT.neutral)
    expect(wallColor(0.8, s).getHex()).toBe(HEAT.amber.getHex())
  })
})

describe('geometry', () => {
  it('counts triangles and their areas', () => {
    const box = new BoxGeometry(2, 2, 2)
    expect(triangleCount(box)).toBe(12)
    const areas = triangleAreas(box.toNonIndexed())
    expect(Array.from(areas).reduce((a, b) => a + b, 0)).toBeCloseTo(24)
  })

  it('paints every vertex of a triangle', () => {
    const painted = paint(new BoxGeometry(1, 1, 1), () => HEAT.red)
    const colors = painted.getAttribute('color')
    expect(colors.count).toBe(36)
    expect(new Color(colors.getX(5), colors.getY(5), colors.getZ(5)).getHex()).toBe(HEAT.red.getHex())
  })
})

it('finds no overhangs on a box standing on the bed', () => {
  const geometry = new BoxGeometry(10, 10, 10).translate(0, 0, 5)
  const box = new Box3(new Vector3(-5, -5, 0), new Vector3(5, 5, 10))
  const result = overhangs([model(geometry, box)], fdmProfile())
  expect(result.summary).toEqual({ mode: 'overhangs', busy: false, area: 0, extreme: null })
  expect(result.heat.main.getAttribute('color')).toBeDefined()
})

it('reports a floating box bottom as a 90 degree overhang', () => {
  const geometry = new BoxGeometry(10, 10, 10).translate(0, 0, 15)
  const box = new Box3(new Vector3(-5, -5, 0), new Vector3(5, 5, 20))
  const result = overhangs([model(geometry, box)], fdmProfile())
  expect(result.summary.area).toBeCloseTo(100)
  expect(result.summary.extreme).toBeCloseTo(90)
})
