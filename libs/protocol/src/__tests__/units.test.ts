import { describe, expect, it } from 'vitest'
import { convertUnit, findUnit, formatQuantity, splitCaptionUnit } from '../units.ts'

describe('splitCaptionUnit', () => {
  it('takes a known unit in trailing parentheses off the caption', () => {
    expect(splitCaptionUnit('Cable path length (mm)')).toEqual({ caption: 'Cable path length', unit: 'mm' })
    expect(splitCaptionUnit('Bend angle (°)')).toEqual({ caption: 'Bend angle', unit: 'deg' })
    expect(splitCaptionUnit('Infill (%)')).toEqual({ caption: 'Infill', unit: '%' })
    expect(splitCaptionUnit('(mm)')).toEqual({ unit: 'mm' })
  })

  it('keeps captions without a known unit untouched', () => {
    expect(splitCaptionUnit('Width')).toEqual({ caption: 'Width' })
    expect(splitCaptionUnit('Gap (default from printer)')).toEqual({ caption: 'Gap (default from printer)' })
    expect(splitCaptionUnit('Wall (mm) per side')).toEqual({ caption: 'Wall (mm) per side' })
  })
})

describe('formatting', () => {
  it('formats with the locale grouping and unit label', () => {
    expect(formatQuantity(1054.4, 'mm', 'de-DE')).toBe('1.054,4 mm')
    expect(formatQuantity(1054.4, 'mm', 'en-US')).toBe('1,054.4 mm')
    expect(formatQuantity(100, 'deg', 'en-US')).toBe('100°')
    expect(formatQuantity(3, undefined, 'en-US')).toBe('3')
  })

  it('looks up units and converts without float noise', () => {
    expect(findUnit('Millimetres')).toBe('mm')
    expect(findUnit('kg')).toBeNull()
    expect(convertUnit(1.1, 'cm', 'mm')).toBe(11)
  })
})
