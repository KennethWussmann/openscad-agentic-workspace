import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addMissingConfigSections,
  deepMerge,
  deleteYamlValue,
  loadProjectConfig,
  loadSettings,
  printProfile,
  setYamlValue,
  writeOpenscadPath,
} from '../config.ts'
import { tempPaths, write } from './helpers.ts'

describe('deepMerge', () => {
  it('merges objects key by key and replaces lists and scalars', () => {
    expect(
      deepMerge(
        { export: { formats: ['3mf', 'stl'], filename: 'a' }, render: { sheet: true } },
        { export: { formats: ['obj'] }, render: { sheetSize: 600 } },
      ),
    ).toEqual({ export: { formats: ['obj'], filename: 'a' }, render: { sheet: true, sheetSize: 600 } })
  })
})

describe('settings', () => {
  it('applies defaults to an empty config', () => {
    const paths = tempPaths('config-defaults')
    const s = loadSettings(paths)
    expect(s.openscad.backend).toBe('manifold')
    expect(s.export.formats).toEqual(['3mf', 'stl'])
    expect(s.server.port).toBe(5180)
    expect(s.libraries).toEqual({})
  })

  it('rejects unknown keys with a readable message', () => {
    const paths = tempPaths('config-strict')
    write(paths.config, 'render:\n  sheets: true\n')
    expect(() => loadSettings(paths)).toThrow(/render/)
  })

  it('lets projects inherit, add and re-pin libraries and override settings', () => {
    const paths = tempPaths('config-project')
    write(
      paths.config,
      'libraries:\n  BOSL2: { git: https://example.com/BOSL2.git, ref: v1 }\nexport:\n  formats: [3mf]\n  filename: "{project}"\n',
    )
    const projectFile = path.join(paths.workspace, 'p', 'config.yaml')
    write(
      projectFile,
      'name: P\nparts:\n  - id: body\n    defines: { part: body }\nlibraries:\n  BOSL2: { git: https://example.com/BOSL2.git, ref: v2 }\n  Extra: { git: https://example.com/x.git, ref: main }\nexport:\n  formats: [stl]\n',
    )
    const { meta, settings } = loadProjectConfig(paths, projectFile, 'p')
    expect(meta.name).toBe('P')
    expect(meta.parts).toEqual([{ id: 'body', file: 'src/main.scad', defines: { part: 'body' }, preview: true }])
    expect(settings.libraries.BOSL2.ref).toBe('v2')
    expect(Object.keys(settings.libraries)).toEqual(['BOSL2', 'Extra'])
    expect(settings.export).toEqual({ formats: ['stl'], filename: '{project}' })
  })

  it('resolves the default fdm profile with minWall defaulting to twice the nozzle', () => {
    const paths = tempPaths('config-profile')
    expect(printProfile(loadSettings(paths))).toEqual({
      process: 'fdm',
      printer: 'default',
      bed: [256, 256, 256],
      layerHeight: 0.2,
      nozzle: 0.4,
      nozzles: [0.4],
      overhangAngle: 45,
      minWall: 0.8,
      tolerances: { press: 0.2, sliding: 0.3, loose: 0.45, hole: 0.2 },
      minRegionArea: 1,
    })
  })

  it('lets projects pick a nozzle, a layer height and another printer', () => {
    const paths = tempPaths('config-printers')
    write(
      paths.config,
      [
        'print:\n  printer: x1\n',
        'printers:\n',
        '  x1: { process: fdm, bed: [256, 256, 256], nozzles: [0.4, 0.2, 0.6] }\n',
        '  mars: { process: resin, bed: [143, 89, 175], pixel: 0.035 }\n',
      ].join(''),
    )
    const projectFile = path.join(paths.workspace, 'p', 'config.yaml')
    const project = () => printProfile(loadProjectConfig(paths, projectFile, 'p').settings)
    write(projectFile, 'name: P\nprint:\n  nozzle: 0.6\n  layerHeight: 0.3\n')
    expect(project()).toMatchObject({ printer: 'x1', nozzle: 0.6, minWall: 1.2, layerHeight: 0.3 })
    write(projectFile, 'name: P\nprinters:\n  x1:\n    overhangAngle: 55\n')
    expect(project()).toMatchObject({ printer: 'x1', nozzle: 0.4, overhangAngle: 55 })
    write(projectFile, 'name: P\nprint:\n  printer: mars\n')
    expect(project()).toMatchObject({
      process: 'resin',
      printer: 'mars',
      bed: [143, 89, 175],
      pixel: 0.035,
      layerHeight: 0.05,
      minFeature: 0.3,
      tolerances: { press: 0.05, sliding: 0.1, loose: 0.2, hole: 0.1 },
    })
    expect(project()).not.toHaveProperty('nozzle')
  })

  it('rejects invalid printer selections and process-specific keys', () => {
    const paths = tempPaths('config-printer-errors')
    const fails = (yaml: string, pattern: RegExp) => {
      write(paths.config, yaml)
      expect(() => loadSettings(paths)).toThrow(pattern)
    }
    fails('print:\n  printer: nope\n', /print\.printer: "nope" is not defined in printers \(default\)/)
    fails('print:\n  nozzle: 0.8\n', /print\.nozzle: 0\.8 mm is not one of printers\.default\.nozzles/)
    fails('printers:\n  default: { process: fdm, bed: [200, 200, 200], pixel: 0.05 }\n', /pixel/)
    fails('printers:\n  default: { process: resin, bed: [100, 60, 150], pixel: 0.05, nozzles: [0.4] }\n', /nozzles/)
    fails('printers:\n  default: { process: sls, bed: [100, 100, 100] }\n', /process/)
    fails(
      'printers:\n  default: { process: resin, bed: [100, 60, 150], pixel: 0.05 }\nprint:\n  nozzle: 0.4\n',
      /only applies to fdm printers/,
    )
    fails('printers:\n  default: { process: fdm, bed: [200, 200, 200], minWall: 0.3 }\n', /at least the nozzle/)
  })

  it('rejects duplicate part ids', () => {
    const paths = tempPaths('config-parts')
    const projectFile = path.join(paths.workspace, 'p', 'config.yaml')
    write(projectFile, 'name: P\nparts:\n  - id: a\n  - id: a\n')
    expect(() => loadProjectConfig(paths, projectFile, 'p')).toThrow(/unique/)
  })
})

describe('yaml editing', () => {
  it('keeps comments when caching the OpenSCAD path', () => {
    const paths = tempPaths('config-write')
    writeFileSync(paths.config, '# keep me\nopenscad:\n  # and me\n  path: null\n')
    writeOpenscadPath(paths, '/opt/openscad')
    const text = readFileSync(paths.config, 'utf8')
    expect(text).toContain('# keep me')
    expect(text).toContain('# and me')
    expect(loadSettings(paths).openscad.path).toBe('/opt/openscad')
  })

  it('appends sections from config.example.yaml that an older config.yaml lacks', () => {
    const paths = tempPaths('config-sections')
    writeFileSync(paths.config, '# mine\nopenscad:\n  path: /opt/openscad\nprint:\n  nozzle: 0.4\n')
    const added = addMissingConfigSections(paths)
    expect(added).toEqual(['libraries', 'render', 'export', 'server', 'printers', 'check'])
    const text = readFileSync(paths.config, 'utf8')
    expect(text.startsWith('# mine\nopenscad:\n  path: /opt/openscad\nprint:\n  nozzle: 0.4\n\n')).toBe(true)
    expect(text).toContain('\ncheck:\n')
    const settings = loadSettings(paths)
    expect(settings.openscad.path).toBe('/opt/openscad')
    expect(printProfile(settings)).toMatchObject({ printer: 'default', nozzle: 0.4 })
    expect(addMissingConfigSections(paths)).toEqual([])
  })

  it('sets and deletes nested values in an empty file', () => {
    const paths = tempPaths('config-set')
    writeFileSync(paths.config, '')
    setYamlValue(paths.config, ['libraries', 'Lib'], { git: 'https://x/y.git', ref: 'abc' })
    expect(loadSettings(paths).libraries.Lib).toEqual({ git: 'https://x/y.git', ref: 'abc' })
    deleteYamlValue(paths.config, ['libraries', 'Lib'])
    expect(loadSettings(paths).libraries).toEqual({})
  })
})
