import { describe, expect, it } from 'vitest'
import { parseQuantity } from '../quantity.ts'
import type { Unit } from '../units.ts'

const value = (text: string, unit?: Unit, locale = 'en-US') => {
  const r = parseQuantity(text, { unit, locale })
  return r.ok ? r.value : r.error
}

describe('parseQuantity', () => {
  it('reads plain numbers in the parameter unit', () => {
    expect(value('12', 'mm')).toBe(12)
    expect(value(' -2.5 ', 'mm')).toBe(-2.5)
    expect(value('.5')).toBe(0.5)
    expect(value('\u22123')).toBe(-3)
  })

  it('accepts comma and dot as decimal separator', () => {
    expect(value('2,5', 'mm', 'en-US')).toBe(2.5)
    expect(value('2.5', 'mm', 'de-DE')).toBe(2.5)
    expect(value('0,250', 'mm', 'en-US')).toBe(0.25)
    expect(value('0.250', 'mm', 'de-DE')).toBe(0.25)
  })

  it('reads grouped thousands the way the locale writes them', () => {
    expect(value('1.054,4', 'mm', 'de-DE')).toBe(1054.4)
    expect(value('1,054.4', 'mm', 'en-US')).toBe(1054.4)
    expect(value('1.054,4', 'mm', 'en-US')).toBe(1054.4)
    expect(value('2.018', 'mm', 'de-DE')).toBe(2018)
    expect(value('2,018', 'mm', 'en-US')).toBe(2018)
    expect(value('2.018', 'mm', 'en-US')).toBe(2.018)
    expect(value('2,018', 'mm', 'de-DE')).toBe(2.018)
    expect(value('1.000.000', 'mm', 'de-DE')).toBe(1000000)
    expect(value('1\u202f000,5', 'mm', 'fr-FR')).toBe(1000.5)
  })

  it('rejects malformed numbers', () => {
    expect(value('')).toBe('Enter a number')
    expect(value('abc')).toBe('"abc" is not a number')
    expect(value('1.2.3')).toBe('"1.2.3" is not a number')
    expect(value('1,5.3')).toBe('"1,5.3" is not a number')
    expect(value('12,34,5')).toBe('"12,34,5" is not a number')
  })

  it('converts other units into the parameter unit', () => {
    expect(value('1m', 'mm')).toBe(1000)
    expect(value('1 cm', 'mm')).toBe(10)
    expect(value('1,1 cm', 'mm', 'de-DE')).toBe(11)
    expect(value('2 in', 'mm')).toBe(50.8)
    expect(value('2.5 mm', 'cm')).toBe(0.25)
    expect(value('1 rad', 'deg')).toBeCloseTo(57.2957795131)
    expect(value('90°', 'deg')).toBe(90)
    expect(value('1.5 M', 'mm')).toBe(1500)
  })

  it('rejects units that do not fit the parameter', () => {
    expect(value('5 kg', 'mm')).toBe('Unknown unit "kg"')
    expect(value('5 deg', 'mm')).toBe('Enter a length (mm, cm, m, in, ft)')
    expect(value('5 mm', 'deg')).toBe('Enter an angle (deg, rad)')
    expect(value('5 mm')).toBe('This value has no unit')
  })
})

describe('arithmetic', () => {
  it('calculates with plain numbers in the parameter unit', () => {
    expect(value('1000 * 2', 'mm')).toBe(2000)
    expect(value('1000 - 3 cm', 'mm')).toBe(970)
    expect(value('100cm * 2', 'mm')).toBe(2000)
    expect(value('2 * 100cm', 'mm')).toBe(2000)
    expect(value('1 m / 4', 'mm')).toBe(250)
    expect(value('1 m + 20 cm + 5', 'mm')).toBe(1205)
    expect(value('2 + 3 * 4')).toBe(14)
    expect(value('(2 + 3) * 4')).toBe(20)
    expect(value('(1 + 0.5) m', 'mm')).toBe(1500)
    expect(value('-(2 - 5)')).toBe(3)
    expect(value('10 * -2')).toBe(-20)
    expect(value('0.1 + 0.2')).toBe(0.3)
    expect(value('6 \u00d7 2 \u00f7 4 \u2212 1')).toBe(2)
    expect(value('1 m / 10 cm', 'mm')).toBe(10)
  })

  it('reads locale numbers inside expressions', () => {
    expect(value('1.000 * 2,5', 'mm', 'de-DE')).toBe(2500)
    expect(value('1,5 m - 2,5 cm', 'mm', 'de-DE')).toBe(1475)
  })

  it('explains invalid expressions', () => {
    expect(value('10 cm * 2 cm', 'mm')).toBe('Multiply by plain numbers only, e.g. "10 cm * 2"')
    expect(value('2 / 1 m', 'mm')).toBe('Divide by plain numbers only, e.g. "1 m / 4"')
    expect(value('5 / 0')).toBe('Division by zero')
    expect(value('(1 + 2')).toBe('Missing ")"')
    expect(value('1 +')).toBe('Incomplete expression')
    expect(value('1 2')).toBe('Unexpected "2"')
    expect(value('2 * )')).toBe('Unexpected ")"')
    expect(value('(1 cm) mm', 'mm')).toBe('"mm" follows a value that already has a unit')
    expect(value('1000 - 3 cm')).toBe('This value has no unit')
  })
})
