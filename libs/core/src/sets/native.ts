import { existsSync } from 'node:fs'
import path from 'node:path'
import type { DefineValue } from '@scad/protocol'
import { loadProjectConfig } from '../config/load.ts'
import { readJson, writeJsonAtomic } from '../fs/json.ts'
import { type Paths, projectLayout, toPosix } from '../workspace/paths.ts'
import { setAppliesTo } from './sets.ts'

export const NATIVE_FORMAT_VERSION = '1'

export type NativeSetFile = {
  fileFormatVersion: string
  parameterSets: Record<string, Record<string, string>>
}

export type NativeSync = { file: string; sets: string[]; removed: string[] }

const nested = (v: DefineValue): string =>
  Array.isArray(v) ? `[${v.map(nested).join(', ')}]` : typeof v === 'string' ? JSON.stringify(v) : String(v)

export const nativeValue = (v: DefineValue) => (typeof v === 'string' ? v : nested(v))

export const nativeSetPath = (dir: string, scadFile: string) =>
  path.join(dir, `${scadFile.replace(/\.scad$/i, '')}.json`)

export const syncNativeSets = (paths: Paths, project: string, onlyExisting = false): NativeSync[] => {
  const layout = projectLayout(paths, project)
  const { meta } = loadProjectConfig(paths, layout.config, project)
  const files = [...new Set(meta.parts.map((p) => p.file))]
  return files.flatMap((file) => {
    const target = nativeSetPath(layout.dir, file)
    const exists = existsSync(target)
    if (onlyExisting && !exists) return []
    const parts = meta.parts.filter((p) => p.file === file)
    const parameterSets: NativeSetFile['parameterSets'] = {}
    for (const [name, set] of Object.entries(meta.sets))
      if (parts.some((p) => setAppliesTo(set, p.id)))
        parameterSets[name] = Object.fromEntries(Object.entries(set.values).map(([k, v]) => [k, nativeValue(v)]))
    const previous = exists ? Object.keys(readJson<NativeSetFile>(target)?.parameterSets ?? {}) : []
    writeJsonAtomic(target, { fileFormatVersion: NATIVE_FORMAT_VERSION, parameterSets } satisfies NativeSetFile)
    return [
      {
        file: toPosix(path.relative(layout.dir, target)),
        sets: Object.keys(parameterSets),
        removed: previous.filter((name) => !(name in parameterSets)),
      },
    ]
  })
}
