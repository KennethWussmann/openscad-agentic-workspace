import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { resolvePaths, writeAnnotations } from '@scad/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const base = path.resolve(import.meta.dirname, '../.test-tmp', `cli-${process.pid}`)
const workspace = path.join(base, 'workspace')
const config = path.join(base, 'config.yaml')
const main = path.resolve(import.meta.dirname, 'main.ts')

const scad = (...args: string[]) => {
  const run = spawnSync(process.execPath, [main, ...args], {
    env: { ...process.env, SCAD_WORKSPACE: workspace, SCAD_CONFIG: config },
    encoding: 'utf8',
  })
  return { code: run.status, stdout: run.stdout, stderr: run.stderr }
}

const json = <T>(...args: string[]) => {
  const r = scad(...args, '--json')
  return { ...r, data: JSON.parse(r.stdout) as T }
}

beforeAll(() => {
  rmSync(base, { recursive: true, force: true })
  mkdirSync(workspace, { recursive: true })
  writeFileSync(config, 'server:\n  port: 5390\n')
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

it('prints help without a command', () => {
  expect(scad().stdout).toContain('pnpm scad <command>')
})

it('fails with usage for unknown commands and flags', () => {
  expect(scad('nope').code).toBe(2)
  expect(scad('list', '--bogus').code).toBe(1)
})

it('shows the active printer and validates project configs in doctor', () => {
  const shown = scad('printer')
  expect(shown.stdout).toContain('Designing for default (fdm), bed 256 x 256 x 256 mm')
  expect(shown.stdout).toContain('tolerances: press 0.2, sliding 0.3, loose 0.45 mm per side')
  mkdirSync(path.join(workspace, 'broken'), { recursive: true })
  writeFileSync(path.join(workspace, 'broken', 'config.yaml'), 'name: Broken\nprint:\n  printer: nope\n')
  const doctor = scad('doctor')
  expect(doctor.stdout).toMatch(/FAIL {2}projects/)
  expect(doctor.stdout).toContain('print.printer: "nope" is not defined in printers (default)')
  rmSync(path.join(workspace, 'broken'), { recursive: true, force: true })
})

it('requires a project for check', () => {
  const r = scad('check')
  expect(r.code).toBe(2)
  expect(r.stderr).toContain('Missing project id')
})

it('creates and lists projects', () => {
  const created = json<{ project: string }>('new', 'clip', '--name', 'Cable Clip')
  expect(created.code).toBe(0)
  expect(created.data.project).toBe('clip')
  expect(existsSync(path.join(workspace, 'clip', 'src', 'main.scad'))).toBe(true)
  const list = json<{ id: string; name: string }[]>('list')
  expect(list.data.map((p) => [p.id, p.name])).toEqual([['clip', 'Cable Clip']])
  expect(json<{ error: string }>('new', 'clip').data.error).toMatch(/exists/)
})

it('manages local libraries', () => {
  expect(scad('lib', 'new', 'fasteners').code).toBe(0)
  expect(existsSync(path.join(workspace, '_libs', 'fasteners', 'fasteners.scad'))).toBe(true)
  const libs = json<{ local: { name: string }[] }>('lib', 'list')
  expect(libs.data.local.map((l) => l.name)).toEqual(['fasteners'])
})

it('shows pending annotations with geometry and snapshot path, then clears them', () => {
  const source = { kind: 'working' as const, version: null, render: null }
  writeAnnotations(
    resolvePaths({ workspace, config }),
    'clip',
    {
      source,
      camera: { position: [80, -80, 60], target: [0, 0, 0], up: [0, 0, 1], projection: 'perspective' },
      section: { axis: 'x', normal: [-1, 0, 0], constant: 12 },
      note: 'see both',
      snapshot:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      annotations: [
        {
          n: 1,
          text: 'make this hole 0.5 mm bigger',
          kind: 'face',
          point: [12, 5, 4],
          normal: [-1, 0, 0],
          part: { id: 'main', file: 'src/main.scad', mesh: 0, color: '#b8c4d0' },
          surface: {
            type: 'cylindrical',
            area: 100.5,
            bbox: { min: [10.4, 3.4, 0], max: [13.6, 6.6, 8], size: [3.2, 3.2, 8] },
            triangles: 64,
            facet: {
              normal: [-1, 0, 0],
              area: 3.1,
              bbox: { min: [10.4, 4.8, 0], max: [10.4, 5.2, 8], size: [0, 0.4, 8] },
            },
            cylinder: { axis: [0, 0, 1], center: [12, 5, 4], radius: 1.6, length: 8, arc: 360, concave: true },
          },
          source,
        },
        {
          n: 2,
          text: 'round this edge',
          kind: 'edge',
          point: [20, 0, 8],
          normal: [0, 0, 1],
          part: { id: 'main', file: 'src/main.scad', mesh: 0, color: '#b8c4d0' },
          edge: { a: [0, 0, 8], b: [40, 0, 8], length: 40, angle: 90, convex: true },
          surface: null,
          source: { kind: 'version', version: 'v001', render: null },
        },
      ],
    },
    null,
  )
  const text = scad('proposal', 'clip').stdout
  expect(text).toContain('#1 "make this hole 0.5 mm bigger"')
  expect(text).toContain('part main (src/main.scad) color #b8c4d0, face at (12, 5, 4)')
  expect(text).toContain('cylindrical hole/concave, d 3.2 (r 1.6), axis (0, 0, 1) through (12, 5, 4)')
  expect(text).toContain('edge: (0, 0, 8) -> (40, 0, 8), length 40, 90 deg between faces, convex')
  expect(text).toContain('placed on: version v001')
  expect(text).toContain('section: kept x <= 12')
  expect(text).toMatch(/snapshot: .*workspace\/clip\/proposals\/annotations\.png/)
  const data = json<{ params: null; annotations: { snapshot: string; annotations: unknown[] } }>(
    'proposal',
    'clip',
  ).data
  expect(data.params).toBeNull()
  expect(data.annotations.annotations).toHaveLength(2)
  expect(scad('status', 'clip').stdout).toContain('ANNOTATIONS pending from the browser: 2 note(s)')
  expect(json<{ id: string; proposal: boolean }[]>('list').data[0].proposal).toBe(true)
  expect(scad('proposal', 'clip', '--clear').code).toBe(0)
  expect(scad('proposal', 'clip').stdout).toContain('No pending proposal.')
})

describe('with OpenSCAD', () => {
  it('renders, checks, checkpoints, lists versions and exports', () => {
    const render = json<{ status: string; sheet: string | null }>('render', 'clip')
    expect(render.code).toBe(0)
    expect(render.data.status).toBe('ok')
    expect(render.data.sheet).toMatch(/preview\/sheet\.png$/)
    expect(scad('status', 'clip').stdout).toContain('check: not run yet')
    const check = json<{ status: string; parts: { id: string; manifold: { status: string } }[] }>('check', 'clip')
    expect(check.code).toBe(0)
    expect(check.data.status).toBe('pass')
    expect(check.data.parts.map((p) => [p.id, p.manifold.status])).toEqual([['main', 'pass']])
    expect(existsSync(path.join(workspace, 'clip', 'preview', 'check.json'))).toBe(true)
    const text = scad('check', 'clip').stdout
    expect(text).toContain('PASS  clip  default (fdm), bed 256 x 256 x 256 mm, layer 0.2 mm, nozzle 0.4 mm')
    expect(text).toMatch(/PASS {2}overhangs/)
    expect(text).toMatch(/PASS {2}manifold {3}watertight/)
    expect(scad('status', 'clip').stdout).toContain('check: pass')
    const version = json<{ id: string; check: { status: string; message: string | null } }>(
      'checkpoint',
      'clip',
      '-m',
      'Initial',
    )
    expect(version.data.id).toBe('v001')
    expect(version.data.check).toEqual({ status: 'pass', message: null })
    expect(json<{ versions: { id: string }[] }>('versions', 'clip').data.versions.map((v) => v.id)).toEqual(['v001'])
    const exported = json<{ files: { ok: boolean }[] }>('export', 'clip', '--formats', '3mf')
    expect(exported.data.files.every((f) => f.ok)).toBe(true)
    const snap = json<{ ok: boolean }>('snapshot', 'clip', '--section', 'x=10')
    expect(snap.data.ok).toBe(true)
    const focused = json<{ ok: boolean; file: string }>('snapshot', 'clip', '--section', 'x=10', '--focus', '10,5,2:3')
    expect(focused.data.ok).toBe(true)
    expect(focused.data.file).toMatch(/snapshot-auto-x10-below-at10_5_2\.png$/)
    expect(scad('snapshot', 'clip', '--focus', '10,5').code).toBe(2)
    const model = path.join(workspace, 'clip', 'preview', 'main.3mf')
    const before = readFileSync(model)
    const defined = json<{ ok: boolean; file: string; defines: Record<string, unknown> }>(
      'snapshot',
      'clip',
      '-D',
      'width=20',
      '-D',
      'corner_radius=0',
    )
    expect(defined.data.ok).toBe(true)
    expect(defined.data.defines).toEqual({ width: 20, corner_radius: 0 })
    expect(defined.data.file).toMatch(/snapshot-auto-defined\.png$/)
    expect(readFileSync(model).equals(before)).toBe(true)
    expect(readdirSync(path.join(workspace, 'clip', 'temp')).filter((f) => f.startsWith('snapshot-'))).toEqual([])
    expect(scad('snapshot', 'clip', '-D', 'width').code).toBe(2)
  })

  it('fails the check for thin walls and hints at it on checkpoint and export', () => {
    writeFileSync(path.join(workspace, 'clip', 'src', 'main.scad'), 'cube([30, 30, 0.3]);\n')
    const check = scad('check', 'clip')
    expect(check.code).toBe(1)
    expect(check.stdout).toContain('Rendered clip first because the sources changed.')
    expect(check.stdout).toMatch(/FAIL {2}walls {6}1800 mm2 thinner than 0.8 mm in 2 region\(s\), thinnest 0.3 mm/)
    expect(scad('checkpoint', 'clip', '-m', 'Thin').stdout).toContain('note: the last check failed')
    writeFileSync(path.join(workspace, 'clip', 'src', 'main.scad'), 'cube([30, 30, 2]);\n')
    expect(json<{ status: string }>('render', 'clip', '--no-sheet').data.status).toBe('ok')
    expect(scad('export', 'clip', '--formats', 'stl').stdout).toContain('the last check is older than the render')
  })

  it('groups repeated findings and lists every group with --all', () => {
    const fins = Array.from(
      { length: 8 },
      (_, i) => `translate([${i * 10 + 2}, ${i % 2 ? 2 : 10}, 2]) cube([0.3, ${4 + i}, 3]);`,
    )
    writeFileSync(path.join(workspace, 'clip', 'src', 'main.scad'), `cube([80, 20, 2]);\n${fins.join('\n')}\n`)
    const check = scad('check', 'clip')
    expect(check.code).toBe(1)
    expect(check.stdout).toMatch(/- 2 x 0\.3 mm, [\d.]+ mm2 each, size [\d. x]+, around \(/)
    expect(check.stdout).toMatch(/\.\.\. \d+ more region\(s\) in 3 group\(s\), --all lists them/)
    const all = scad('check', 'clip', '--all')
    expect(all.stdout).not.toContain('--all lists them')
    expect(all.stdout.match(/- 2 x 0\.3 mm/g)).toHaveLength(8)
  })

  it('releases only after a passing check: check, checkpoint and export in one step', () => {
    const before = json<{ versions: unknown[] }>('versions', 'clip').data.versions.length
    const failed = scad('release', 'clip', '-m', 'Fins')
    expect(failed.code).toBe(1)
    expect(failed.stdout).toContain('Not checkpointed or exported because the check failed.')
    expect(json<{ versions: unknown[] }>('versions', 'clip').data.versions).toHaveLength(before)
    writeFileSync(path.join(workspace, 'clip', 'src', 'main.scad'), 'cube([30, 30, 3]);\n')
    const released = scad('release', 'clip', '-m', 'Thicker', '--formats', 'stl')
    expect(released.code).toBe(0)
    expect(released.stdout).toContain('PASS  check  clip')
    expect(released.stdout).toMatch(/Checkpointed clip v\d{3}: Thicker/)
    expect(released.stdout).toMatch(/ok {3}main stl/)
    expect(released.stdout).not.toContain('note:')
    expect(scad('status', 'clip').stdout).toContain('check: pass')
  })

  it('manages parameter sets and renders, checks, exports and releases them', () => {
    expect(scad('new', 'tray').code).toBe(0)
    const cfg = path.join(workspace, 'tray', 'config.yaml')
    expect(scad('sets', 'tray').stdout).toContain('tray has no parameter sets.')
    const bad = scad('set', 'save', 'tray', 'huge', '-D', 'width=900')
    expect(bad.code).toBe(1)
    expect(bad.stderr).toContain('width: 900 is above the maximum 200')
    expect(scad('set', 'save', 'tray', 'all', '-D', 'width=50').stderr).toContain('"all" is reserved')
    expect(scad('set', 'bogus', 'tray').code).toBe(2)
    const saved = scad('set', 'save', 'tray', 'wide', '-D', 'width=80', '-D', 'depth=20', '--label', 'Wide', '--export')
    expect(saved.code).toBe(0)
    expect(saved.stdout).toContain('Created set wide')
    expect(readFileSync(cfg, 'utf8')).toContain('values: { width: 80, depth: 20 }')
    const listed = json<{ sets: { name: string; changes: { param: string; default: number; value: number }[] }[] }>(
      'sets',
      'tray',
    )
    expect(listed.data.sets[0].changes).toEqual([
      { param: 'width', default: 40, value: 80, same: false },
      { param: 'depth', default: 30, value: 20, same: false },
    ])
    const render = json<{ set: string; parts: { model: string; bbox: { size: number[] } }[]; sheet: string }>(
      'render',
      'tray',
      '--set',
      'wide',
    )
    expect(render.data.set).toBe('wide')
    expect(render.data.parts[0].model).toBe('preview/sets/wide/main.3mf')
    expect(render.data.parts[0].bbox.size).toEqual([80, 20, 20])
    expect(render.data.sheet).toMatch(/preview\/sheet-wide\.png$/)
    expect(scad('render', 'tray', '--set', 'nope').stderr).toContain('Unknown set "nope". Sets: wide')
    const check = scad('check', 'tray', '--set', 'wide')
    expect(check.code).toBe(0)
    expect(check.stdout).toContain('PASS  tray  set wide')
    expect(check.stdout).toMatch(/report: .*preview\/check-wide\.json/)
    const snap = json<{ ok: boolean; file: string }>('snapshot', 'tray', '--set', 'wide')
    expect(snap.data.file).toMatch(/snapshot-auto-wide\.png$/)
    const exported = json<{ files: { set: string; file: string; ok: boolean }[] }>(
      'export',
      'tray',
      '--sets',
      'all',
      '--formats',
      'stl',
    )
    expect(exported.data.files.map((f) => [f.set, f.file, f.ok])).toEqual([
      ['default', 'out/tray-main.stl', true],
      ['wide', 'out/tray-main-wide.stl', true],
    ])
    expect(scad('export', 'tray', '--set', 'wide', '--sets', 'all').code).toBe(2)
    const synced = scad('set', 'sync', 'tray')
    expect(synced.stdout).toContain('native: src/main.json (wide)')
    expect(JSON.parse(readFileSync(path.join(workspace, 'tray', 'src', 'main.json'), 'utf8'))).toEqual({
      fileFormatVersion: '1',
      parameterSets: { wide: { width: '80', depth: '20' } },
    })
    expect(scad('set', 'rename-param', 'tray', 'depth', 'deep').stdout).toContain(
      'WARNING set "wide": deep: not a customizer parameter of src/main.scad',
    )
    expect(scad('set', 'unset', 'tray', 'wide', 'deep').stdout).toContain('Unset deep in wide')
    const released = scad('release', 'tray', '-m', 'Sets', '--formats', 'stl')
    expect(released.code).toBe(0)
    expect(released.stdout).toContain('PASS  check  tray  set wide')
    expect(released.stdout).toMatch(/ok {3}wide main stl {6}out\/tray-main-wide\.stl/)
    writeFileSync(cfg, `${readFileSync(cfg, 'utf8')}  odd:\n    values: { widht: 3 }\n`)
    const doctor = scad('doctor')
    expect(doctor.stdout).toMatch(/WARN {2}sets/)
    expect(doctor.stdout).toContain('tray: WARNING set "odd": widht: not a customizer parameter')
    expect(scad('set', 'rm', 'tray', 'odd').stdout).toContain('Removed set odd')
    expect(json<{ sets: unknown }>('status', 'tray').data.sets).toEqual({
      wide: { label: 'Wide', values: { width: 80 }, export: true },
    })
  })

  it('checks islands and trapped resin instead of overhangs for a resin printer', () => {
    writeFileSync(
      path.join(workspace, 'clip', 'src', 'main.scad'),
      'difference() { cube(20); translate([2, 2, 2]) cube(16); }\ntranslate([30, 0, 5]) cube(5);\n',
    )
    writeFileSync(
      path.join(workspace, 'clip', 'config.yaml'),
      'name: Cable Clip\nprint:\n  printer: mars\nprinters:\n  mars: { process: resin, bed: [143, 89, 175], pixel: 0.035 }\n',
    )
    const check = scad('check', 'clip')
    expect(check.code).toBe(0)
    expect(check.stdout).toContain('WARN  clip  mars (resin), bed 143 x 89 x 175 mm')
    expect(check.stdout).not.toContain('overhangs')
    expect(check.stdout).toMatch(/WARN {2}islands {4}1 island\(s\)/)
    expect(check.stdout).toContain('1 enclosed void(s) trapping resin: add drain holes of at least 2.5 mm')
  })
})
