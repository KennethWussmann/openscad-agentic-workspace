import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ParamDef } from '@scad/protocol'
import { describe, expect, it } from 'vitest'
import {
  createProject,
  effectiveDefines,
  exportBaseName,
  loadProjectConfig,
  loadSettings,
  nativeValue,
  removeSet,
  renameParam,
  requireSet,
  saveSet,
  syncNativeSets,
  unsetParams,
  validateSets,
  valueProblem,
} from '../index.ts'
import { tempPaths, write } from './helpers.ts'

const params: ParamDef[] = [
  { name: 'width', type: 'number', initial: 100, min: 20, max: 400 },
  { name: 'rounded', type: 'boolean', initial: true },
  {
    name: 'style',
    type: 'string',
    initial: 'a',
    options: [
      { name: 'A', value: 'a' },
      { name: 'B', value: 'b' },
    ],
  },
  { name: 'offset', type: 'vector', initial: [0, 0] },
  { name: 'label', type: 'string', initial: '' },
]

const CONFIG = `# Bin project
name: Bin
parts:
  - id: main
    file: src/main.scad
  - id: lid
    file: src/main.scad
    defines: { part: "lid" }
sets:
  # the small one
  small:
    label: Small
    values: { width: 40, rounded: false }
`

const setup = (name: string, config = CONFIG) => {
  const paths = tempPaths(name)
  const layout = createProject({ paths, id: 'bin' })
  writeFileSync(layout.config, config)
  return { paths, layout, load: () => loadProjectConfig(paths, layout.config, 'bin') }
}

describe('set schema', () => {
  it('defaults to no sets and fills set defaults', () => {
    const { load } = setup('sets-schema')
    const { meta } = load()
    expect(meta.sets).toEqual({ small: { label: 'Small', values: { width: 40, rounded: false }, export: false } })
    const plain = setup('sets-absent', 'name: Plain\n')
    expect(plain.load().meta.sets).toEqual({})
  })

  it('rejects reserved names, bad names and unknown parts', () => {
    expect(() => setup('sets-reserved', 'name: X\nsets:\n  default: { values: { a: 1 } }\n').load()).toThrow(
      /reserved set names/,
    )
    expect(() => setup('sets-badname', 'name: X\nsets:\n  Big: { values: { a: 1 } }\n').load()).toThrow(
      /lowercase-dashed/,
    )
    expect(() => setup('sets-parts', 'name: X\nsets:\n  a: { values: { a: 1 }, parts: [nope] }\n').load()).toThrow(
      /"nope" is not a part id/,
    )
  })

  it('is a project key only', () => {
    const paths = tempPaths('sets-root')
    write(paths.config, 'sets:\n  a: { values: { x: 1 } }\n')
    expect(() => loadSettings(paths)).toThrow(/sets/)
  })
})

describe('effectiveDefines', () => {
  it('layers render defines, set values, overrides and part defines, later wins', () => {
    const { load } = setup('sets-merge')
    const config = load()
    config.settings.render.defines = { $fs: 0.4, width: 1, rounded: true }
    const set = requireSet(config.meta, 'small')
    const [main, lid] = config.meta.parts
    expect(effectiveDefines(config.settings, set, { width: 50 }, main)).toEqual({ $fs: 0.4, width: 50, rounded: false })
    expect(effectiveDefines(config.settings, null, {}, lid)).toEqual({ $fs: 0.4, width: 1, rounded: true, part: 'lid' })
    const limited = { name: 'small', def: { ...set.def, parts: ['lid'] } }
    expect(effectiveDefines(config.settings, limited, {}, main)).toEqual({ $fs: 0.4, width: 1, rounded: true })
    expect(() => requireSet(config.meta, 'huge')).toThrow('Unknown set "huge". Sets: small')
  })
})

describe('validateSets', () => {
  it('checks types, ranges, options and vectors', () => {
    expect(valueProblem(params[0], 500)).toBe('500 is above the maximum 400')
    expect(valueProblem(params[0], 10)).toBe('10 is below the minimum 20')
    expect(valueProblem(params[0], '50')).toBe('"50" is not a number')
    expect(valueProblem(params[1], 1)).toBe('1 is not a boolean')
    expect(valueProblem(params[2], 'c')).toBe('"c" is not one of "a", "b"')
    expect(valueProblem(params[3], [1])).toBe('[1] has 1 elements, expected 2')
    expect(valueProblem(params[3], [1, 'x'])).toBe('element 1 of [1,"x"] should be a number')
    expect(valueProblem(params[4], 'Screws')).toBeNull()
  })

  it('reports unknown names and values that part defines always override', () => {
    const { load } = setup(
      'sets-validate',
      'name: X\nparts:\n  - id: main\n    defines: { part: main }\nsets:\n  a: { values: { width: 999, widht: 3, part: lid, $fn: 64 } }\n',
    )
    expect(validateSets(load().meta, params)).toEqual([
      { set: 'a', param: 'width', message: 'width: 999 is above the maximum 400' },
      { set: 'a', param: 'widht', message: 'widht: not a customizer parameter of src/main.scad (OpenSCAD ignores it)' },
      { set: 'a', param: 'part', message: 'part: always overridden by parts[].defines of main' },
    ])
  })
})

describe('export names', () => {
  it('uses {set} when the template has it and a suffix otherwise', () => {
    const values = { project: 'bin', part: 'main', version: 'v1', set: 'small' }
    expect(exportBaseName('{project}-{part}', values, false)).toBe('bin-main-small')
    expect(exportBaseName('{project}-{part}', { ...values, set: 'default' }, false)).toBe('bin-main')
    expect(exportBaseName('{project}-{set}-{part}', { ...values, set: 'default' }, false)).toBe('bin-default-main')
    expect(exportBaseName('{project}-{set}-{part}', values, true)).toBe('bin-small-main-tweaked')
  })
})

describe('editing sets in config.yaml', () => {
  it('creates a set with compact values and keeps comments', () => {
    const { paths, layout, load } = setup('sets-save')
    const result = saveSet({
      paths,
      project: 'bin',
      name: 'tray',
      label: 'Tray',
      values: { width: 160 },
      export: true,
      params,
    })
    expect(result.created).toBe(true)
    const text = readFileSync(layout.config, 'utf8')
    expect(text).toContain('# Bin project')
    expect(text).toContain('# the small one')
    expect(text).toContain('  tray:\n    label: Tray\n    values: { width: 160 }\n    export: true\n')
    expect(load().meta.sets.tray).toEqual({ label: 'Tray', values: { width: 160 }, export: true })
  })

  it('writes values that do not fit on one line as a block', () => {
    const { paths, layout } = setup('sets-block')
    const long = { width: 160, rounded: false, style: 'b', offset: [10, 20], label: 'A long label for the tray' }
    saveSet({ paths, project: 'bin', name: 'long', values: long, params })
    expect(readFileSync(layout.config, 'utf8')).toContain('    values:\n      width: 160\n      rounded: false\n')
    saveSet({
      paths,
      project: 'bin',
      name: 'small',
      values: { style: 'b', offset: [1, 2], label: 'Some more text' },
      params,
    })
    expect(readFileSync(layout.config, 'utf8')).toContain('  small:\n    label: Small\n    values:\n      width: 40\n')
  })

  it('merges values into an existing set, or replaces them', () => {
    const { paths, load } = setup('sets-merge-edit')
    saveSet({ paths, project: 'bin', name: 'small', values: { width: 50, style: 'b' }, params })
    expect(load().meta.sets.small.values).toEqual({ width: 50, rounded: false, style: 'b' })
    saveSet({ paths, project: 'bin', name: 'small', values: { width: 60 }, replace: true, export: true, params })
    expect(load().meta.sets.small).toEqual({ label: 'Small', values: { width: 60 }, export: true })
    saveSet({ paths, project: 'bin', name: 'small', values: {}, export: false, label: '', params })
    expect(load().meta.sets.small).toEqual({ values: { width: 60 }, export: false })
  })

  it('refuses invalid names and values without touching the file', () => {
    const { paths, layout } = setup('sets-guard')
    const before = readFileSync(layout.config, 'utf8')
    const save = (name: string, values: Record<string, unknown>) => () =>
      saveSet({ paths, project: 'bin', name, values: values as never, params })
    expect(save('all', { width: 50 })).toThrow('Invalid set name "all": "all" is reserved')
    expect(save('Big', { width: 50 })).toThrow(/lowercase/)
    expect(save('big', { width: 5000 })).toThrow(/width: 5000 is above the maximum 400/)
    expect(save('big', { widht: 50 })).toThrow(/widht: not a customizer parameter/)
    expect(save('big', {})).toThrow('Set "big" needs at least one value')
    expect(readFileSync(layout.config, 'utf8')).toBe(before)
  })

  it('removes sets and drops the empty sets key', () => {
    const { paths, layout, load } = setup('sets-remove')
    expect(() => removeSet(paths, 'bin', 'nope')).toThrow(/Unknown set/)
    removeSet(paths, 'bin', 'small')
    expect(load().meta.sets).toEqual({})
    expect(readFileSync(layout.config, 'utf8')).not.toContain('sets')
  })

  it('unsets and renames parameters in place', () => {
    const { paths, layout, load } = setup('sets-rename')
    saveSet({ paths, project: 'bin', name: 'big', values: { width: 300 }, params })
    const renamed = renameParam(paths, 'bin', 'width', 'outer_w')
    expect(renamed.changed).toEqual(['small', 'big'])
    expect(readFileSync(layout.config, 'utf8')).toContain('values: { outer_w: 40, rounded: false }')
    expect(() => renameParam(paths, 'bin', 'width', 'x')).toThrow('No set uses "width"')
    expect(unsetParams(paths, 'bin', 'all', ['outer_w']).changed).toEqual(['small', 'big'])
    expect(load().meta.sets.small.values).toEqual({ rounded: false })
    expect(() => unsetParams(paths, 'bin', 'small', ['outer_w'])).toThrow('Not in set "small": outer_w')
  })
})

describe('native OpenSCAD parameter sets', () => {
  it('formats every value as a string', () => {
    expect(nativeValue(40)).toBe('40')
    expect(nativeValue(false)).toBe('false')
    expect(nativeValue('lid')).toBe('lid')
    expect(nativeValue([1, 'a', [true]])).toBe('[1, "a", [true]]')
  })

  it('writes src/<file>.json and keeps it in sync once it exists', () => {
    const { paths, layout } = setup('sets-native')
    const file = path.join(layout.src, 'main.json')
    expect(existsSync(file)).toBe(false)
    expect(syncNativeSets(paths, 'bin', true)).toEqual([])
    write(file, JSON.stringify({ fileFormatVersion: '1', parameterSets: { gui: { width: '1' } } }))
    expect(syncNativeSets(paths, 'bin')).toEqual([{ file: 'src/main.json', sets: ['small'], removed: ['gui'] }])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      fileFormatVersion: '1',
      parameterSets: { small: { width: '40', rounded: 'false' } },
    })
    const saved = saveSet({ paths, project: 'bin', name: 'tray', values: { width: 160 }, params })
    expect(saved.native).toEqual([{ file: 'src/main.json', sets: ['small', 'tray'], removed: [] }])
    expect(JSON.parse(readFileSync(file, 'utf8')).parameterSets.tray).toEqual({ width: '160' })
  })
})
