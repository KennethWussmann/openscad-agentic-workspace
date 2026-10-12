import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { API, APP_ID, createProject, resolvePaths } from '@scad/core'
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

it('reports connected viewers and accepts navigation', async () => {
  expect(await (await fetch(`${url}/viewers`)).json()).toEqual({ total: 0, projects: {} })
  const nav = await fetch(`${url}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'box' }),
  })
  expect(nav.status).toBe(200)
})
