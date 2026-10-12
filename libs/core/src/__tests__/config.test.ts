import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deepMerge,
  deleteYamlValue,
  loadProjectConfig,
  loadSettings,
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

  it('sets and deletes nested values in an empty file', () => {
    const paths = tempPaths('config-set')
    writeFileSync(paths.config, '')
    setYamlValue(paths.config, ['libraries', 'Lib'], { git: 'https://x/y.git', ref: 'abc' })
    expect(loadSettings(paths).libraries.Lib).toEqual({ git: 'https://x/y.git', ref: 'abc' })
    deleteYamlValue(paths.config, ['libraries', 'Lib'])
    expect(loadSettings(paths).libraries).toEqual({})
  })
})
