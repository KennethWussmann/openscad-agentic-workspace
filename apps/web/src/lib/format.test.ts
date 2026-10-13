import { describe, expect, it } from 'vitest'
import { baseName, fmt, fmtVec, location, plural, sameJson } from './format.ts'

describe('fmt', () => {
  it('uses fewer decimals for larger numbers', () => {
    expect(fmt(1.234)).toBe('1.23')
    expect(fmt(123.456)).toBe('123.5')
    expect(fmt(1234.5)).toBe('1235')
    expect(fmt(-150.25)).toBe('-150.3')
  })

  it('joins vectors with x', () => {
    expect(fmtVec([20, 10, 5.5])).toBe('20.00 x 10.00 x 5.50')
  })
})

it('takes the last path segment as base name', () => {
  expect(baseName('out/box-main.3mf')).toBe('box-main.3mf')
  expect(baseName('plain.stl')).toBe('plain.stl')
})

it('formats diagnostic locations', () => {
  expect(location({ level: 'error', message: 'x', file: 'main.scad', line: 4 })).toBe('main.scad:4')
  expect(location({ level: 'error', message: 'x', file: 'main.scad' })).toBe('main.scad')
  expect(location({ level: 'error', message: 'x' })).toBe('')
})

it('pluralizes words', () => {
  expect(plural(1, 'note')).toBe('1 note')
  expect(plural(0, 'note')).toBe('0 notes')
  expect(plural(3, 'tweak')).toBe('3 tweaks')
})

it('compares values structurally', () => {
  expect(sameJson([1, { a: 2 }], [1, { a: 2 }])).toBe(true)
  expect(sameJson([1, 2], [2, 1])).toBe(false)
  expect(sameJson(null, null)).toBe(true)
})
