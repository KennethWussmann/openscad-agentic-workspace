import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { loadProjectConfig } from './config.ts'
import { lockedLibraries } from './libraries.ts'
import { isInside, type Paths, projectLayout, toPosix } from './paths.ts'
import type { DefineValue, VersionMeta } from './protocol.ts'
import { inputsChanged, readJson, readRender, sha1, writeJsonAtomic } from './render.ts'

const VERSION_DIR = /^v(\d{3,})$/

export const versionId = (index: number) => `v${String(index).padStart(3, '0')}`

export const listVersions = (paths: Paths, project: string): VersionMeta[] => {
  const dir = projectLayout(paths, project).versions
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((d) => VERSION_DIR.test(d))
    .map((d) => readJson<VersionMeta>(path.join(dir, d, 'version.json')))
    .filter((v): v is VersionMeta => v !== null)
    .sort((a, b) => a.index - b.index)
}

export const resolveVersion = (paths: Paths, project: string, ref: string) => {
  const versions = listVersions(paths, project)
  if (ref === 'latest') return versions.at(-1) ?? null
  const n = Number(ref.replace(/^v/, ''))
  return versions.find((v) => v.index === n) ?? null
}

export const versionDir = (paths: Paths, project: string, id: string) =>
  path.join(projectLayout(paths, project).versions, id)

export type CheckpointOptions = {
  paths: Paths
  project: string
  message: string
  restoredFrom?: string
  force?: boolean
}

export const checkpoint = ({ paths, project, message, restoredFrom, force }: CheckpointOptions): VersionMeta => {
  const layout = projectLayout(paths, project)
  const render = readRender(paths, project)
  if (!render) throw new Error(`Project "${project}" has not been rendered yet. Run render first.`)
  if (render.status !== 'ok')
    throw new Error('The last render has errors. Fix them and render again before checkpointing.')
  const changed = inputsChanged(paths, render.inputs)
  if (changed.length)
    throw new Error(
      `Sources changed since the last render (${changed.map((c) => c.path).join(', ')}). Render again before checkpointing.`,
    )
  const versions = listVersions(paths, project)
  const latest = versions.at(-1)
  if (!force && latest && JSON.stringify(latest.inputs) === JSON.stringify(render.inputs))
    throw new Error(`Nothing changed since ${latest.id}. Use --force to checkpoint anyway.`)
  const index = (latest?.index ?? 0) + 1
  const id = versionId(index)
  const dir = versionDir(paths, project, id)
  mkdirSync(dir, { recursive: true })
  if (existsSync(layout.src)) cpSync(layout.src, path.join(dir, 'src'), { recursive: true })
  if (existsSync(layout.config)) cpSync(layout.config, path.join(dir, 'config.yaml'))
  for (const input of render.inputs) {
    const abs = path.join(paths.workspace, input.path)
    if (isInside(paths.libs, abs)) cpSync(abs, path.join(dir, 'libs', path.relative(paths.libs, abs)))
  }
  const parts = render.parts.map((p) => {
    if (!p.model) return { id: p.id, label: p.label, model: null, bbox: p.bbox }
    const target = path.join(dir, 'preview', `${p.id}.3mf`)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(path.join(layout.dir, p.model), target)
    return { id: p.id, label: p.label, model: toPosix(path.relative(layout.dir, target)), bbox: p.bbox }
  })
  let sheet: string | null = null
  if (existsSync(layout.sheet) && statSync(layout.sheet).mtimeMs >= Date.parse(render.finishedAt) - 1000) {
    const target = path.join(dir, 'preview', 'sheet.png')
    cpSync(layout.sheet, target)
    sheet = toPosix(path.relative(layout.dir, target))
  }
  const params: Record<string, DefineValue> = {}
  for (const p of render.params) params[p.name] = p.initial
  const meta: VersionMeta = {
    id,
    index,
    message,
    createdAt: new Date().toISOString(),
    ...(restoredFrom ? { restoredFrom } : {}),
    parts,
    params,
    inputs: render.inputs,
    libraries: lockedLibraries(paths, loadProjectConfig(paths, layout.config, project).settings),
    sheet,
  }
  writeJsonAtomic(path.join(dir, 'version.json'), meta)
  return meta
}

export type RestoreResult = {
  version: VersionMeta
  libsDiffer: string[]
  libsRestored: string[]
}

export const restoreFiles = (paths: Paths, project: string, ref: string, withLibs = false): RestoreResult => {
  const layout = projectLayout(paths, project)
  const version = resolveVersion(paths, project, ref)
  if (!version) throw new Error(`Version "${ref}" not found in project "${project}"`)
  const dir = versionDir(paths, project, version.id)
  rmSync(layout.src, { recursive: true, force: true })
  if (existsSync(path.join(dir, 'src'))) cpSync(path.join(dir, 'src'), layout.src, { recursive: true })
  if (existsSync(path.join(dir, 'config.yaml'))) cpSync(path.join(dir, 'config.yaml'), layout.config)
  const libsDiffer: string[] = []
  const libsRestored: string[] = []
  for (const input of version.inputs) {
    const abs = path.join(paths.workspace, input.path)
    if (!isInside(paths.libs, abs)) continue
    if (existsSync(abs) && sha1(abs) === input.sha) continue
    if (withLibs) {
      const saved = path.join(dir, 'libs', path.relative(paths.libs, abs))
      mkdirSync(path.dirname(abs), { recursive: true })
      cpSync(saved, abs)
      libsRestored.push(input.path)
    } else libsDiffer.push(input.path)
  }
  return { version, libsDiffer, libsRestored }
}

export const isDirty = (paths: Paths, project: string) => {
  const latest = listVersions(paths, project).at(-1)
  if (!latest) return true
  const render = readRender(paths, project)
  if (render && JSON.stringify(render.inputs) !== JSON.stringify(latest.inputs)) return true
  return inputsChanged(paths, latest.inputs).length > 0
}
