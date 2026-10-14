import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  checkProject,
  checkpoint,
  checkState,
  createProject,
  discoverOpenscad,
  exportProject,
  loadProjectConfig,
  projectLayout,
  readCheck,
  readRender,
  renderProject,
  renderSheet,
} from '../index.ts'
import { tempPaths, write } from './helpers.ts'

const { openscad } = await discoverOpenscad({ configured: null })
if (!openscad) throw new Error('OpenSCAD is required to run the tests')

describe('with OpenSCAD', () => {
  const paths = tempPaths('openscad')

  beforeAll(() => {
    const layout = createProject({ paths, id: 'kit' })
    write(path.join(paths.libs, 'shapes', 'shapes.scad'), 'module plate(s) { cube([s, s, 2]); }\n')
    writeFileSync(
      layout.config,
      'name: Kit\nparts:\n  - id: base\n    defines: { part: "base" }\n  - id: lid\n    defines: { part: "lid" }\nsets:\n  big:\n    values: { size: 40, part: "lid" }\n    export: true\n  big-lid:\n    values: { size: 30 }\n    parts: [lid]\n',
    )
    writeFileSync(
      path.join(layout.src, 'main.scad'),
      [
        'use <shapes/shapes.scad>',
        '/* [Size] */',
        '// Plate size',
        'size = 20; // [10:1:50]',
        'part = "base"; // [base, lid]',
        'echo(size = size);',
        'if (part == "base") color("red") plate(size);',
        'else translate([0, 0, 5]) plate(size / 2);',
      ].join('\n'),
    )
  })

  it('renders every part, collects params, inputs and diagnostics', async () => {
    const result = await renderProject({ paths, project: 'kit', openscad })
    expect(result.status).toBe('ok')
    expect(result.parts.map((p) => [p.id, p.model, p.bbox?.size])).toEqual([
      ['base', 'preview/base.3mf', [20, 20, 2]],
      ['lid', 'preview/lid.3mf', [10, 10, 2]],
    ])
    expect(result.params.map((p) => p.name)).toEqual(['size'])
    expect(result.inputs.map((i) => i.path)).toEqual([
      '_libs/shapes/shapes.scad',
      'kit/config.yaml',
      'kit/src/main.scad',
    ])
    expect(result.parts[0].diagnostics).toContainEqual({ level: 'echo', message: 'size = 20' })
  })

  it('applies overrides for tweak renders without touching the preview', async () => {
    const before = readRender(paths, 'kit')
    const tweak = await renderProject({ paths, project: 'kit', openscad, kind: 'tweak', overrides: { size: 30 } })
    expect(tweak.parts[0].model).toBe('temp/tweak/base.3mf')
    expect(tweak.parts[0].bbox?.size).toEqual([30, 30, 2])
    expect(readRender(paths, 'kit')?.finishedAt).toBe(before?.finishedAt)
  })

  it('keeps the last good model when a render fails', async () => {
    const main = path.join(projectLayout(paths, 'kit').src, 'main.scad')
    const good = readFileSync(main, 'utf8')
    writeFileSync(main, `${good}\nbroken(`)
    try {
      const result = await renderProject({ paths, project: 'kit', openscad })
      expect(result.status).toBe('error')
      expect(result.parts[0]).toMatchObject({ status: 'error', stale: true, model: 'preview/base.3mf' })
      const error = result.parts[0].diagnostics.find((d) => d.level === 'error')
      expect(error?.file).toMatch(/main\.scad$/)
      expect(error?.line).toBeGreaterThanOrEqual(9)
    } finally {
      writeFileSync(main, good)
    }
  })

  it('checks the rendered 3MF models and tracks whether the check is current', async () => {
    await renderProject({ paths, project: 'kit', openscad })
    expect(checkState(paths, 'kit').status).toBe('missing')
    const result = checkProject(paths, 'kit')
    expect(result.parts.map((p) => [p.id, p.triangles, p.bbox?.size, p.manifold.status, p.bed.status])).toEqual([
      ['base', 12, [20, 20, 2], 'pass', 'pass'],
      ['lid', 12, [10, 10, 2], 'pass', 'warn'],
    ])
    expect(result.parts[1].bed.minZ).toBe(5)
    expect(result.status).toBe('warn')
    expect(readCheck(paths, 'kit')?.render).toBe(readRender(paths, 'kit')?.finishedAt)
    expect(checkState(paths, 'kit').status).toBe('warn')
    expect(checkProject(paths, 'kit', ['lid']).parts.map((p) => p.id)).toEqual(['lid'])
    expect(() => checkProject(paths, 'kit', ['nope'])).toThrow(/Unknown part/)
    await renderProject({ paths, project: 'kit', openscad })
    expect(checkState(paths, 'kit').status).toBe('stale')
  })

  it('renders a contact sheet, checkpoints and exports', async () => {
    const result = await renderProject({ paths, project: 'kit', openscad })
    const layout = projectLayout(paths, 'kit')
    const { settings } = loadProjectConfig(paths, layout.config, 'kit')
    const models = result.parts.map((p) => path.join(layout.dir, p.model as string))
    const diagnostics = await renderSheet(
      { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
      models,
      layout.sheet,
    )
    expect(diagnostics.filter((d) => d.level === 'error')).toEqual([])
    expect(existsSync(layout.sheet)).toBe(true)
    const v = checkpoint({ paths, project: 'kit', message: 'Kit' })
    expect(v.sheet).toBe('versions/v001/preview/sheet.png')
    const exported = await exportProject({ paths, project: 'kit', openscad, formats: ['3mf', 'stl'] })
    expect(exported.version).toBe('v001')
    expect(exported.files.map((f) => [f.file, f.ok])).toEqual([
      ['out/kit-base.3mf', true],
      ['out/kit-base.stl', true],
      ['out/kit-lid.3mf', true],
      ['out/kit-lid.stl', true],
    ])
    expect(readFileSync(path.join(layout.out, 'kit-base.stl')).subarray(0, 5).toString()).not.toBe('solid')
    expect(exported.meshCheck).toBeNull()
  })

  it('exports tweaked values under their own name and checks the exported meshes', async () => {
    const exported = await exportProject({
      paths,
      project: 'kit',
      openscad,
      formats: ['3mf'],
      parts: ['base'],
      overrides: { size: 30 },
      meshCheck: true,
    })
    expect(exported.version).toBe('tweaked')
    expect(exported.files.map((f) => [f.file, f.ok])).toEqual([['out/kit-base-tweaked.3mf', true]])
    expect(exported.meshCheck?.parts.map((p) => [p.id, p.bbox?.size])).toEqual([['base', [30, 30, 2]]])
    const record = JSON.parse(readFileSync(path.join(projectLayout(paths, 'kit').out, 'export.json'), 'utf8'))
    expect(record).toMatchObject({ version: 'tweaked', overrides: { size: 30 } })
  })

  it('renders, checks and exports parameter sets next to the default model', async () => {
    const layout = projectLayout(paths, 'kit')
    const big = await renderProject({ paths, project: 'kit', openscad, set: 'big' })
    expect(big.set).toBe('big')
    expect(big.parts.map((p) => [p.id, p.model, p.bbox?.size])).toEqual([
      ['base', 'preview/sets/big/base.3mf', [40, 40, 2]],
      ['lid', 'preview/sets/big/lid.3mf', [20, 20, 2]],
    ])
    expect(readRender(paths, 'kit')?.parts[0].bbox?.size).toEqual([20, 20, 2])
    const lidOnly = await renderProject({ paths, project: 'kit', openscad, set: 'big-lid' })
    expect(lidOnly.parts.map((p) => [p.id, p.bbox?.size])).toEqual([['lid', [15, 15, 2]]])
    const checked = checkProject(paths, 'kit', undefined, 'big')
    expect(checked.set).toBe('big')
    expect(readCheck(paths, 'kit', 'big')?.parts[0].bbox?.size).toEqual([40, 40, 2])
    expect(existsSync(path.join(layout.preview, 'check-big.json'))).toBe(true)
    expect(checkState(paths, 'kit', 'big').status).toBe(checked.status)
    const exported = await exportProject({
      paths,
      project: 'kit',
      openscad,
      formats: ['3mf'],
      sets: ['default', 'big', 'big-lid'],
    })
    expect(exported.sets).toEqual(['default', 'big', 'big-lid'])
    expect(exported.files.map((f) => [f.set, f.file, f.ok])).toEqual([
      ['default', 'out/kit-base.3mf', true],
      ['default', 'out/kit-lid.3mf', true],
      ['big', 'out/kit-base-big.3mf', true],
      ['big', 'out/kit-lid-big.3mf', true],
      ['big-lid', 'out/kit-lid-big-lid.3mf', true],
    ])
    await expect(exportProject({ paths, project: 'kit', openscad, sets: ['nope'] })).rejects.toThrow(/Unknown set/)
  })
})
