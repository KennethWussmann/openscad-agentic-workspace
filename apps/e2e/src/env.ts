import path from 'node:path'
import { API } from '@scad/protocol'

export const E2E_ROOT = path.resolve(import.meta.dirname, '..')
export const REPO_ROOT = path.resolve(E2E_ROOT, '../..')
export const BASE = path.join(E2E_ROOT, '.test-tmp')
export const WORKSPACE = path.join(BASE, 'workspace')
export const CONFIG = path.join(BASE, 'config.yaml')
export const CLI = path.join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts')
export const PORT = Number(process.env.E2E_PORT ?? 5399)
export const BASE_URL = `http://localhost:${PORT}`
export const HEALTH_URL = `${BASE_URL}${API}/health`
