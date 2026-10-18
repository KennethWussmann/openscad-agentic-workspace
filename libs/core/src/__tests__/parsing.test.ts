import type { Vec3 } from '@scad/protocol'
import { describe, expect, it } from 'vitest'
import {
  fileName,
  formatDefine,
  OUTLINE_COLOR,
  parseDefineInput,
  parseDepsFile,
  parseDiagnostics,
  parseParamExport,
  wrapperSource,
} from '../index.ts'

describe('parseDiagnostics', () => {
  it('extracts levels, files and lines', () => {
    const stderr = [
      "WARNING: Ignoring unknown module 'foo' in file src/main.scad, line 2",
      'ECHO: "ok", 3',
      'DEPRECATED: The assign() module will be removed',
      'Geometries in cache: 1',
      'ERROR: Parser error: syntax error in file "src/a b.scad", line 6',
    ].join('\n')
    expect(parseDiagnostics(stderr, false)).toEqual([
      { level: 'warning', message: "Ignoring unknown module 'foo'", file: 'src/main.scad', line: 2 },
      { level: 'echo', message: '"ok", 3' },
      { level: 'deprecated', message: 'The assign() module will be removed' },
      { level: 'error', message: 'Parser error: syntax error', file: 'src/a b.scad', line: 6 },
    ])
  })

  it('turns unprefixed fatal output into an error', () => {
    expect(parseDiagnostics('Current top level object is empty.\n', false)).toEqual([
      { level: 'error', message: 'Current top level object is empty.' },
    ])
  })

  it('always reports an error for a failed run', () => {
    expect(parseDiagnostics('something odd\n', false)).toEqual([{ level: 'error', message: 'something odd' }])
  })
})

describe('parseDepsFile', () => {
  it('handles continuation lines, escaped spaces and Windows drive letters', () => {
    expect(parseDepsFile('/w/out.3mf: \\\n\t/w/src/main.scad \\\n\t/w/_libs/my\\ lib/a.scad\n')).toEqual([
      '/w/src/main.scad',
      '/w/_libs/my lib/a.scad',
    ])
    expect(parseDepsFile('C:\\w\\out.3mf: \\\n\tC:\\w\\src\\main.scad\n')).toEqual(['C:\\w\\src\\main.scad'])
  })
})

describe('defines', () => {
  it('formats values as OpenSCAD literals', () => {
    expect(formatDefine('w', 10)).toBe('w=10')
    expect(formatDefine('label', 'a "b"')).toBe('label="a \\"b\\""')
    expect(formatDefine('on', false)).toBe('on=false')
    expect(formatDefine('$fn', 64)).toBe('$fn=64')
    expect(formatDefine('v', [1, [2, 3]])).toBe('v=[1,[2,3]]')
  })

  it('parses typed input', () => {
    expect(parseDefineInput('12.5')).toBe(12.5)
    expect(parseDefineInput('true')).toBe(true)
    expect(parseDefineInput('[1,2]')).toEqual([1, 2])
    expect(parseDefineInput('abc')).toBe('abc')
  })
})

describe('parseParamExport', () => {
  it('maps the customizer JSON', () => {
    const json = JSON.stringify({
      parameters: [
        { caption: 'Width', group: 'Size', initial: 40, max: 100, min: 10, step: 1, name: 'width', type: 'number' },
        { group: 'Parameters', initial: true, name: 'round', type: 'boolean' },
        { group: 'Size', initial: [1, 2, 3], name: 'v', type: 'number' },
        { group: 'Size', initial: 'a', name: 'mode', type: 'string', options: [{ name: 'A', value: 'a' }] },
        { caption: 'Cable length (mm)', initial: 1000, name: 'len', type: 'number' },
        { caption: '(deg)', initial: [0, 90], name: 'tilt', type: 'number' },
        { caption: 'Pocket (generic)', initial: 3, name: 'pocket', type: 'number' },
        { caption: 'Label (mm)', initial: 'x', name: 'label', type: 'string' },
      ],
    })
    expect(parseParamExport(json)).toEqual([
      { name: 'width', type: 'number', initial: 40, caption: 'Width', group: 'Size', min: 10, max: 100, step: 1 },
      { name: 'round', type: 'boolean', initial: true },
      { name: 'v', type: 'vector', initial: [1, 2, 3], group: 'Size' },
      { name: 'mode', type: 'string', initial: 'a', group: 'Size', options: [{ name: 'A', value: 'a' }] },
      { name: 'len', type: 'number', initial: 1000, caption: 'Cable length', unit: 'mm' },
      { name: 'tilt', type: 'vector', initial: [0, 90], unit: 'deg' },
      { name: 'pocket', type: 'number', initial: 3, caption: 'Pocket (generic)' },
      { name: 'label', type: 'string', initial: 'x', caption: 'Label (mm)' },
    ])
  })
})

describe('wrapperSource', () => {
  it('imports every model and cuts away the far side of a section', () => {
    const src = wrapperSource(['C:\\w\\a.3mf', '/w/b.3mf'], {
      section: { axis: 'x', at: 5, keep: 'below' },
      bbox: { min: [0, 0, 0], max: [10, 10, 10], size: [10, 10, 10] },
    })
    expect(src).toContain('import("C:/w/a.3mf")')
    expect(src).toContain('import("/w/b.3mf")')
    expect(src).toMatch(/difference\(\)/)
    expect(src).toContain('translate([5, -545, -545]) cube([1100, 1100, 1100])')
  })

  it('clips the model to a cube around the focus point', () => {
    const src = wrapperSource(['/w/a.3mf'], { focus: { center: [10, 20, 2], radius: 4 } })
    expect(src).toMatch(/^intersection\(\) \{\n {2}union\(\) \{/)
    expect(src).toContain('translate([6, 16, -2]) cube(8)')
  })

  it('draws outline segments as thin dark boxes, except in sections and focus views', () => {
    const outlines: [Vec3, Vec3][] = [
      [
        [0, 0, 0],
        [30, 0, 0],
      ],
      [
        [0, 0, 0],
        [0, 0, 30],
      ],
    ]
    const src = wrapperSource(['/w/a.3mf'], { outlines })
    expect(src).toContain(`color("${OUTLINE_COLOR}") polyhedron(`)
    expect(src).toContain('[30,0.05,0.05]')
    expect(src.match(/\[\d+,\d+,\d+,\d+\]/g)).toHaveLength(12)
    expect(wrapperSource(['/w/a.3mf'], { outlines, focus: { center: [0, 0, 0], radius: 4 } })).not.toContain(
      'polyhedron',
    )
  })
})

describe('fileName', () => {
  it('fills placeholders and strips unsafe characters', () => {
    expect(fileName('{project}-{part}-{version}', { project: 'box', part: 'lid', version: 'v002' })).toBe(
      'box-lid-v002',
    )
    expect(fileName('{project}/{part}', { project: 'a', part: 'b' })).toBe('a_b')
  })
})
