import { expect, it } from 'vitest'
import { project } from '../test/fixtures.ts'
import { fmtValue, overridesOf, setValues, slugify, withoutDefaults } from './sets.ts'

it('reads the values of the selected set', () => {
  const p = project({ sets: { tray: { values: { width: 40 }, export: false } } })
  expect(setValues(p, 'tray')).toEqual({ width: 40 })
  expect(setValues(p, 'gone')).toEqual({})
  expect(setValues(p, null)).toBe(setValues(null, 'tray'))
})

it('layers edits over set values and keeps the set object when nothing is edited', () => {
  const set = { width: 40, depth: 10 }
  expect(overridesOf(set, {})).toBe(set)
  expect(overridesOf(set, { depth: 12 })).toEqual({ width: 40, depth: 12 })
})

it('drops values equal to the defaults', () => {
  const params = [{ name: 'width', type: 'number' as const, initial: 20 }]
  expect(withoutDefaults({ width: 20, other: 1 }, params)).toEqual({ other: 1 })
})

it('derives set names from labels and formats values', () => {
  expect(slugify('  Screw Tray (M3)! ')).toBe('screw-tray-m3')
  expect(fmtValue('lid')).toBe('"lid"')
  expect(fmtValue([1, 2])).toBe('[1,2]')
  expect(fmtValue([1, 2], 'mm')).toBe('[1,2] mm')
  expect(fmtValue(1054.4, 'mm', 'de-DE')).toBe('1.054,4 mm')
  expect(fmtValue(true)).toBe('true')
})
