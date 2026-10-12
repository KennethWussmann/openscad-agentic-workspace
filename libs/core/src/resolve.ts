import { ensureRootConfig, loadSettings, writeOpenscadPath } from './config.ts'
import { type DiscoveryHost, discoverOpenscad, installHint, type Openscad, systemHost } from './discovery.ts'
import type { Paths } from './paths.ts'

const cache = new Map<string, Openscad>()

export class OpenscadNotFoundError extends Error {
  readonly tried: string[]

  constructor(tried: string[], platform: NodeJS.Platform) {
    super(installHint(platform))
    this.tried = tried
  }
}

export const resolveOpenscad = async (paths: Paths, host: DiscoveryHost = systemHost()): Promise<Openscad> => {
  const cached = cache.get(paths.config)
  if (cached) return cached
  ensureRootConfig(paths)
  const settings = loadSettings(paths)
  const { openscad, tried } = await discoverOpenscad({ configured: settings.openscad.path, host })
  if (!openscad) throw new OpenscadNotFoundError(tried, host.platform)
  if (openscad.source === 'path' || openscad.source === 'common') {
    writeOpenscadPath(paths, openscad.command.length === 1 ? openscad.command[0] : openscad.command)
  }
  cache.set(paths.config, openscad)
  return openscad
}

export const clearOpenscadCache = () => cache.clear()
