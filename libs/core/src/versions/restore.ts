import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { VersionMeta } from '@scad/protocol'
import { sha1 } from '../fs/json.ts'
import { isInside, type Paths, projectLayout } from '../workspace/paths.ts'
import { resolveVersion, versionDir } from './versions.ts'

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
