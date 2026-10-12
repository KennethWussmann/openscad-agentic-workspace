import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deleteYamlValue, LIBRARY_NAME, type LibrarySpec, type Settings, setYamlValue } from './config.ts'
import type { Paths } from './paths.ts'
import type { LockedLibrary } from './protocol.ts'

export type LocalLibrary = {
  name: string
  dir: string
  summary: string
}

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

const git = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString()
    })
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString()
    })
    child.on('error', (e) => reject(new Error(`git is required for OpenSCAD libraries: ${e.message}`)))
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`git ${args[0]} failed: ${err.trim() || `exit ${code}`}`)),
    )
  })

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

const firstLine = (dir: string) => {
  const readme = path.join(dir, 'README.md')
  if (!existsSync(readme)) return ''
  return (
    readFileSync(readme, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#')) ?? ''
  )
}

export const listLocalLibraries = (paths: Paths): LocalLibrary[] =>
  existsSync(paths.libs)
    ? readdirSync(paths.libs, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => ({
          name: d.name,
          dir: path.join(paths.libs, d.name),
          summary: firstLine(path.join(paths.libs, d.name)),
        }))
    : []

const LOCAL_NAME = /^[a-z0-9][a-z0-9_-]*$/

export const libraryTemplate = (name: string) => `// ${name}: shared OpenSCAD library.
// Import with: use <${name}/${name}.scad>
// All dimensions in millimetres. Modules take explicit parameters, no globals.

// Returns the value clamped into [lo, hi].
function ${name.replace(/-/g, '_')}_clamp(v, lo, hi) = min(max(v, lo), hi);
`

export const createLocalLibrary = (paths: Paths, name: string, summary = '') => {
  if (!LOCAL_NAME.test(name)) throw new Error(`Invalid library name "${name}": use lowercase letters, digits, - and _`)
  const dir = path.join(paths.libs, name)
  if (existsSync(dir)) throw new Error(`Library "${name}" already exists`)
  mkdirSync(path.join(dir, 'examples'), { recursive: true })
  writeFileSync(path.join(dir, `${name}.scad`), libraryTemplate(name))
  writeFileSync(
    path.join(dir, 'README.md'),
    `# ${name}\n\n${summary || 'What this library provides.'}\n\n## Usage\n\n\`\`\`openscad\nuse <${name}/${name}.scad>\n\`\`\`\n\n## Modules and functions\n\n| Name | Purpose |\n| --- | --- |\n`,
  )
  writeFileSync(
    path.join(dir, 'examples', 'demo.scad'),
    `use <${name}/${name}.scad>\n\necho(${name.replace(/-/g, '_')}_clamp(5, 0, 3));\ncube(10);\n`,
  )
  return dir
}
