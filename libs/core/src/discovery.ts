import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type OpenscadSource = 'env' | 'config' | 'path' | 'common'

export type Openscad = {
  command: string[]
  version: string
  source: OpenscadSource
}

export type DiscoveryHost = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  isFile: (p: string) => boolean
  version: (command: string[]) => Promise<string | null>
}

const isFile = (p: string) => {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

export const readVersion = (command: string[], timeoutMs = 15000) =>
  new Promise<string | null>((resolve) => {
    let out = ''
    try {
      const child = spawn(command[0], [...command.slice(1), '-v'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        windowsHide: true,
      })
      child.stdout.on('data', (c: Buffer) => {
        out += c.toString()
      })
      child.stderr.on('data', (c: Buffer) => {
        out += c.toString()
      })
      child.on('error', () => resolve(null))
      child.on('close', (code) => {
        const match = out.match(/OpenSCAD version\s+(\S+)/i)
        resolve(code === 0 && match ? match[1] : null)
      })
    } catch {
      resolve(null)
    }
  })

export const systemHost = (): DiscoveryHost => ({
  platform: process.platform,
  env: process.env,
  home: os.homedir(),
  isFile,
  version: (command) => readVersion(command),
})

export const commonLocations = (host: DiscoveryHost): string[] => {
  const { platform, env, home } = host
  if (platform === 'darwin')
    return [
      '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
      path.join(home, 'Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD'),
      '/Applications/OpenSCAD-nightly.app/Contents/MacOS/OpenSCAD',
      path.join(home, 'Applications/OpenSCAD-nightly.app/Contents/MacOS/OpenSCAD'),
      '/opt/homebrew/bin/openscad',
      '/usr/local/bin/openscad',
    ]
  if (platform === 'win32') {
    const roots = [
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs'),
    ]
    const dirs = roots
      .filter((r): r is string => Boolean(r))
      .flatMap((r) => [path.win32.join(r, 'OpenSCAD'), path.win32.join(r, 'OpenSCAD (Nightly)')])
    dirs.push(path.win32.join(home, 'scoop', 'apps', 'openscad', 'current'))
    return dirs.flatMap((d) => [path.win32.join(d, 'openscad.com'), path.win32.join(d, 'openscad.exe')])
  }
  return [
    '/usr/bin/openscad',
    '/usr/local/bin/openscad',
    '/snap/bin/openscad',
    '/var/lib/flatpak/exports/bin/org.openscad.OpenSCAD',
    path.join(home, '.local/share/flatpak/exports/bin/org.openscad.OpenSCAD'),
    '/usr/bin/openscad-nightly',
  ]
}

export const pathLocations = (host: DiscoveryHost): string[] => {
  const win = host.platform === 'win32'
  const sep = win ? ';' : ':'
  const join = win ? path.win32.join : path.posix.join
  const dirs = (host.env.PATH ?? host.env.Path ?? '').split(sep).filter(Boolean)
  const names = win ? ['openscad.com', 'openscad.exe'] : ['openscad', 'openscad-nightly']
  return dirs.flatMap((d) => names.map((n) => join(d, n)))
}

export const toCommand = (value: string | string[]) => (Array.isArray(value) ? value : [value])

export type DiscoverOptions = {
  configured: string | string[] | null
  host?: DiscoveryHost
}

export type DiscoverResult = {
  openscad: Openscad | null
  tried: string[]
  configuredBroken: boolean
}

export const discoverOpenscad = async ({
  configured,
  host = systemHost(),
}: DiscoverOptions): Promise<DiscoverResult> => {
  const tried: string[] = []
  const attempt = async (command: string[], source: OpenscadSource): Promise<Openscad | null> => {
    tried.push(command.join(' '))
    const version = await host.version(command)
    return version ? { command, version, source } : null
  }
  const envPath = host.env.OPENSCAD_PATH
  if (envPath) {
    const found = await attempt([envPath], 'env')
    return { openscad: found, tried, configuredBroken: false }
  }
  let configuredBroken = false
  if (configured) {
    const found = await attempt(toCommand(configured), 'config')
    if (found) return { openscad: found, tried, configuredBroken }
    configuredBroken = true
  }
  const seen = new Set<string>()
  for (const [list, source] of [
    [pathLocations(host), 'path'],
    [commonLocations(host), 'common'],
  ] as const) {
    for (const file of list) {
      if (seen.has(file) || !host.isFile(file)) continue
      seen.add(file)
      const found = await attempt([file], source)
      if (found) return { openscad: found, tried, configuredBroken }
    }
  }
  return { openscad: null, tried, configuredBroken }
}

export const installHint = (platform: NodeJS.Platform) =>
  [
    'OpenSCAD was not found. Install a recent release or nightly from https://openscad.org/downloads.html',
    platform === 'darwin'
      ? 'macOS: move OpenSCAD.app to /Applications or ~/Applications, or `brew install --cask openscad@snapshot`.'
      : platform === 'win32'
        ? 'Windows: use the installer (default C:\\Program Files\\OpenSCAD) or `winget install OpenSCAD.OpenSCAD`.'
        : 'Linux: use your package manager, the snap, the flatpak (org.openscad.OpenSCAD) or an AppImage.',
    'Or point to it explicitly: set OPENSCAD_PATH or openscad.path in config.yaml.',
  ].join('\n')
