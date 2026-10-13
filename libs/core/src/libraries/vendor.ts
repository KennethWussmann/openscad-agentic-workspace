import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { LockedLibrary } from '@scad/protocol'
import { LIBRARY_NAME, type LibrarySpec, type Settings } from '../config/schema.ts'
import { deleteYamlValue, setYamlValue } from '../config/yaml.ts'
import type { Paths } from '../workspace/paths.ts'
import { git } from './git.ts'

export type LibraryStatus = LibrarySpec & {
  name: string
  dir: string
  installed: boolean
  commit: string | null
}

const MARKER = '.scad-library.json'

const safeRef = (ref: string) => ref.replace(/[^A-Za-z0-9._-]/g, '_')

export const vendorRoot = (paths: Paths, name: string, spec: LibrarySpec) =>
  path.join(paths.vendor, `${name}@${safeRef(spec.ref)}`)

const readMarker = (root: string) => {
  try {
    return JSON.parse(readFileSync(path.join(root, MARKER), 'utf8')) as LockedLibrary
  } catch {
    return null
  }
}

export const libraryStatus = (paths: Paths, settings: Settings): LibraryStatus[] =>
  Object.entries(settings.libraries).map(([name, spec]) => {
    const root = vendorRoot(paths, name, spec)
    const marker = readMarker(root)
    const installed = marker !== null && marker.git === spec.git && existsSync(path.join(root, name))
    return { name, ...spec, dir: path.join(root, name), installed, commit: installed ? marker.commit : null }
  })

export const lockedLibraries = (paths: Paths, settings: Settings): LockedLibrary[] =>
  libraryStatus(paths, settings)
    .filter((l) => l.installed && l.commit)
    .map(({ name, git, ref, commit }) => ({ name, git, ref, commit: commit as string }))

export const resolveRemoteRef = async (url: string, ref = 'HEAD') => {
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref
  const out = await git(['ls-remote', url, ref, `refs/tags/${ref}^{}`], process.cwd())
  const lines = out.split(/\r?\n/).filter(Boolean)
  const peeled = lines.find((l) => l.endsWith('^{}'))
  const line = peeled ?? lines[0]
  if (!line) throw new Error(`Ref "${ref}" not found in ${url}`)
  return line.split(/\s+/)[0]
}

const inflight = new Map<string, Promise<LockedLibrary>>()

export const installLibrary = (paths: Paths, name: string, spec: LibrarySpec): Promise<LockedLibrary> => {
  const root = vendorRoot(paths, name, spec)
  const running = inflight.get(root)
  if (running) return running
  const task = (async () => {
    const tmp = `${root}.tmp-${process.pid}`
    rmSync(tmp, { recursive: true, force: true })
    const repo = path.join(tmp, name)
    mkdirSync(repo, { recursive: true })
    try {
      await git(['init', '--quiet'], repo)
      await git(['remote', 'add', 'origin', spec.git], repo)
      await git(['fetch', '--quiet', '--depth', '1', 'origin', spec.ref], repo)
      await git(['checkout', '--quiet', 'FETCH_HEAD'], repo)
      const commit = await git(['rev-parse', 'HEAD'], repo)
      const locked: LockedLibrary = { name, ...spec, commit }
      writeFileSync(path.join(tmp, MARKER), `${JSON.stringify(locked, null, 2)}\n`)
      rmSync(root, { recursive: true, force: true })
      renameSync(tmp, root)
      return locked
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true })
      throw e
    }
  })().finally(() => inflight.delete(root))
  inflight.set(root, task)
  return task
}

export const syncLibraries = async (paths: Paths, settings: Settings) => {
  const installed: LockedLibrary[] = []
  for (const lib of libraryStatus(paths, settings)) {
    if (lib.installed) continue
    installed.push(await installLibrary(paths, lib.name, { git: lib.git, ref: lib.ref }))
  }
  return installed
}

export type AddLibraryOptions = {
  paths: Paths
  name: string
  git: string
  ref?: string
  configFile: string
}

export const addLibrary = async ({ paths, name, git: url, ref, configFile }: AddLibraryOptions) => {
  if (!LIBRARY_NAME.test(name))
    throw new Error(`Invalid library name "${name}": it must be the folder name used in include <${name}/...>`)
  const pinned = ref ?? (await resolveRemoteRef(url))
  const locked = await installLibrary(paths, name, { git: url, ref: pinned })
  setYamlValue(configFile, ['libraries', name], { git: url, ref: pinned })
  return locked
}

export const removeLibrary = (configFile: string, name: string) => {
  deleteYamlValue(configFile, ['libraries', name])
}

export const pruneVendor = (paths: Paths, keep: string[]) => {
  if (!existsSync(paths.vendor)) return []
  const removed: string[] = []
  for (const entry of readdirSync(paths.vendor)) {
    const dir = path.join(paths.vendor, entry)
    if (keep.includes(dir)) continue
    rmSync(dir, { recursive: true, force: true })
    removed.push(entry)
  }
  return removed
}
