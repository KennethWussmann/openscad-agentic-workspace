import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import type { Paths } from '@scad/core'
import { APP_ID, createApiClient, type Health, PROJECT_PARAM } from '@scad/protocol'

export type ServerInfo = { port: number; pid: number; started: boolean }

const PORT_RANGE = 10

const readState = (paths: Paths): { port: number } | null => {
  try {
    return JSON.parse(readFileSync(paths.serverState, 'utf8')) as { port: number }
  } catch {
    return null
  }
}

export const viewerApi = (port: number) => createApiClient(`http://localhost:${port}`)

export const health = (port: number): Promise<Health | null> =>
  viewerApi(port)
    .health(AbortSignal.timeout(800))
    .catch(() => null)

const ours = (paths: Paths, h: Health | null) =>
  h !== null && h.app === APP_ID && path.resolve(h.workspace) === path.resolve(paths.workspace)

const isFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, () => srv.close(() => resolve(true)))
  })

export const findServer = async (paths: Paths, basePort: number): Promise<ServerInfo | null> => {
  const recorded = readState(paths)?.port
  const ports = [...new Set([recorded, ...Array.from({ length: PORT_RANGE }, (_, i) => basePort + i)])].filter(
    (p): p is number => typeof p === 'number',
  )
  for (const port of ports) {
    const h = await health(port)
    if (ours(paths, h)) return { port, pid: (h as Health).pid, started: false }
  }
  return null
}

export const ensureServer = async (paths: Paths, basePort: number): Promise<ServerInfo> => {
  const running = await findServer(paths, basePort)
  if (running) return running
  let port: number | null = null
  for (let i = 0; i < PORT_RANGE; i++) {
    if (await isFree(basePort + i)) {
      port = basePort + i
      break
    }
  }
  if (port === null) throw new Error(`No free port in ${basePort}-${basePort + PORT_RANGE - 1} for the dev server`)
  const web = path.join(paths.root, 'apps', 'web')
  const vite = path.join(web, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(vite)) throw new Error('Vite is not installed. Run `pnpm install` in the repository root.')
  mkdirSync(paths.workspace, { recursive: true })
  const log = openSync(paths.serverLog, 'a')
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
    cwd: web,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, SCAD_WORKSPACE: paths.workspace, SCAD_CONFIG: paths.config },
    windowsHide: true,
  })
  child.unref()
  writeFileSync(paths.serverState, JSON.stringify({ port, pid: child.pid }))
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const h = await health(port)
    if (ours(paths, h)) return { port, pid: (h as Health).pid, started: true }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Dev server did not come up on port ${port}, see ${paths.serverLog}`)
}

export const stopServer = async (paths: Paths, basePort: number) => {
  const running = await findServer(paths, basePort)
  if (!running) return null
  process.kill(running.pid)
  return running
}

export const viewerUrl = (port: number, project?: string) =>
  `http://localhost:${port}/${project ? `?${PROJECT_PARAM}=${encodeURIComponent(project)}` : ''}`

export const openBrowser = (url: string) => {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
        : ['xdg-open', [url]]
  const child = spawn(cmd, args as string[], { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => undefined)
  child.unref()
}
