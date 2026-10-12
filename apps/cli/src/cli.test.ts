import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { discoverOpenscad } from '@scad/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const base = path.resolve(import.meta.dirname, '../.test-tmp', `cli-${process.pid}`)
const workspace = path.join(base, 'workspace')
const config = path.join(base, 'config.yaml')
const main = path.resolve(import.meta.dirname, 'main.ts')
const hasOpenscad = (await discoverOpenscad({ configured: null })).openscad !== null

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

describe.skipIf(!hasOpenscad)('with OpenSCAD', () => {
  it('renders, checkpoints, lists versions and exports', () => {
    const render = json<{ status: string; sheet: string | null }>('render', 'clip')
    expect(render.code).toBe(0)
    expect(render.data.status).toBe('ok')
    expect(render.data.sheet).toMatch(/preview\/sheet\.png$/)
    expect(json<{ id: string }>('checkpoint', 'clip', '-m', 'Initial').data.id).toBe('v001')
    expect(json<{ versions: { id: string }[] }>('versions', 'clip').data.versions.map((v) => v.id)).toEqual(['v001'])
    const exported = json<{ files: { ok: boolean }[] }>('export', 'clip', '--formats', '3mf')
    expect(exported.data.files.every((f) => f.ok)).toBe(true)
    const snap = json<{ ok: boolean }>('snapshot', 'clip', '--section', 'x=10')
    expect(snap.data.ok).toBe(true)
  })
})
