import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { API, APP_ID, createProject, discoverOpenscad, type ExportResult, resolvePaths } from '@scad/core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { scadWorkspace } from './index.ts'

const base = path.resolve(import.meta.dirname, '../.test-tmp', `plugin-${process.pid}`)
const workspace = path.join(base, 'workspace')
const config = path.join(base, 'config.yaml')
let server: ViteDevServer
let url = ''

beforeAll(async () => {
  rmSync(base, { recursive: true, force: true })
  mkdirSync(workspace, { recursive: true })
  writeFileSync(config, '')
  const paths = resolvePaths({ workspace, config })
  createProject({ paths, id: 'box', name: 'Box' })
  mkdirSync(path.join(workspace, 'box', 'preview'), { recursive: true })
  writeFileSync(path.join(workspace, 'box', 'preview', 'main.3mf'), 'model')
  server = await createServer({
    configFile: false,
    root: base,
    logLevel: 'silent',
    plugins: [scadWorkspace({ workspace, config })],
    server: { port: 0 },
  })
  await server.listen()
  const address = server.httpServer?.address()
  url = `http://localhost:${typeof address === 'object' && address ? address.port : 0}${API}`
})

afterAll(async () => {
  await server.close()
  rmSync(base, { recursive: true, force: true })
})

it('identifies itself and its workspace', async () => {
  const health = (await (await fetch(`${url}/health`)).json()) as { app: string; workspace: string }
  expect(health.app).toBe(APP_ID)
  expect(health.workspace).toBe(workspace)
})

it('lists projects and rejects bad ids', async () => {
  const list = (await (await fetch(`${url}/projects`)).json()) as { id: string; name: string }[]
  expect(list.map((p) => [p.id, p.name])).toEqual([['box', 'Box']])
  expect((await fetch(`${url}/projects/missing`)).status).toBe(404)
  expect((await fetch(`${url}/projects/..%2Fetc`)).status).toBe(400)
})

it('serves only model and preview files from inside the project', async () => {
  const ok = await fetch(`${url}/projects/box/file/preview/main.3mf`)
  expect(ok.status).toBe(200)
  expect(ok.headers.get('content-type')).toBe('model/3mf')
  expect((await fetch(`${url}/projects/box/file/src/main.scad`)).status).toBe(404)
  expect((await fetch(`${url}/projects/box/file/preview/..%2F..%2Fconfig.yaml`)).status).toBe(404)
})

it('stores and clears parameter proposals from the browser', async () => {
  const res = await fetch(`${url}/projects/box/proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: { width: 55 }, note: 'wider' }),
  })
  expect(res.status).toBe(200)
  const file = path.join(workspace, 'box', 'proposals', 'params.json')
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ params: { width: 55 }, note: 'wider', basedOn: null })
  expect((await fetch(`${url}/projects/box/proposal`, { method: 'DELETE' })).status).toBe(200)
  expect(() => readFileSync(file)).toThrow()
})

it('stores annotations with their snapshot, serves the snapshot and rejects invalid ones', async () => {
  const snapshot =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  const source = { kind: 'working', version: null, render: null }
  const body = {
    source,
    camera: { position: [1, 1, 1], target: [0, 0, 0], up: [0, 0, 1], projection: 'perspective' },
    section: null,
    snapshot,
    annotations: [
      {
        n: 1,
        text: 'round this edge',
        kind: 'edge',
        point: [0, 0, 20],
        normal: [0, 0, 1],
        part: { id: 'main', file: 'src/main.scad', mesh: 0, color: '#ffffff' },
        edge: { a: [0, 0, 20], b: [40, 0, 20], length: 40, angle: 90, convex: true },
        surface: null,
        source,
      },
    ],
  }
  const post = (payload: unknown) =>
    fetch(`${url}/projects/box/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  const res = await post(body)
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ count: 1, file: expect.stringMatching(/proposals\/annotations\.json$/) })
  const file = path.join(workspace, 'box', 'proposals', 'annotations.json')
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ snapshot: 'proposals/annotations.png' })
  const image = await fetch(`${url}/projects/box/file/proposals/annotations.png`)
  expect(image.headers.get('content-type')).toBe('image/png')
  const state = (await (await fetch(`${url}/projects/box`)).json()) as { proposals: { annotations: unknown } }
  expect(state.proposals.annotations).not.toBeNull()
  expect((await post({ ...body, annotations: [] })).status).toBe(400)
  expect((await fetch(`${url}/projects/box/annotations`, { method: 'DELETE' })).status).toBe(200)
  expect(() => readFileSync(file)).toThrow()
})

it('reports connected viewers and accepts navigation', async () => {
  expect(await (await fetch(`${url}/viewers`)).json()).toEqual({ total: 0, projects: {} })
  const nav = await fetch(`${url}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'box' }),
  })
  expect(nav.status).toBe(200)
})

const postExport = (project: string, body: unknown) =>
  fetch(`${url}/projects/${project}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

it('rejects exports for unknown projects and invalid overrides', async () => {
  expect((await postExport('missing', {})).status).toBe(404)
  expect((await postExport('box', { overrides: [1] })).status).toBe(400)
})

const found = await discoverOpenscad({ configured: null })

it.skipIf(!found.openscad)(
  'exports 3MF with a mesh check, tweaked files separately, one export at a time',
  async () => {
    const [first, second] = await Promise.all([postExport('box', {}), postExport('box', {})])
    expect([first.status, second.status].sort()).toEqual([200, 409])
    const result = (await (first.status === 200 ? first : second).json()) as ExportResult
    expect(result.files.map((f) => [f.file, f.format, f.ok])).toEqual([['out/box-main.3mf', '3mf', true]])
    expect(result.meshCheck?.parts.map((p) => p.id)).toEqual(['main'])
    expect(result.overrides).toEqual({})
    const file = await fetch(`${url}/projects/box/file/out/box-main.3mf`)
    expect(file.headers.get('content-type')).toBe('model/3mf')
    const tweaked = (await (await postExport('box', { overrides: { width: 30 } })).json()) as ExportResult
    expect(tweaked.version).toBe('tweaked')
    expect(tweaked.overrides).toEqual({ width: 30 })
    expect(tweaked.files.map((f) => f.file)).toEqual(['out/box-main-tweaked.3mf'])
    const record = JSON.parse(readFileSync(path.join(workspace, 'box', 'out', 'export.json'), 'utf8')) as ExportResult
    expect(record.overrides).toEqual({ width: 30 })
  },
)
