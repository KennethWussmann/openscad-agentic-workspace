import path from 'node:path'
import { loadProjectConfig, loadSettings, type Paths, projectLayout, type Settings, toPosix } from '@scad/core'
import { findServer } from './server.ts'

export type Flags = {
  json?: boolean
  name?: string
  description?: string
  from?: string
  part?: string
  sheet?: boolean
  view?: string
  section?: string
  size?: string
  out?: string
  formats?: string
  message?: string
  force?: boolean
  'with-libs'?: boolean
  clear?: boolean
  git?: string
  ref?: string
  project?: string
  open?: boolean
  all?: boolean
  'accept-fail'?: boolean
  focus?: string
  define?: string[]
}

export type Ctx = {
  paths: Paths
  flags: Flags
  args: string[]
}

export type Outcome = { data: unknown; text: string; exitCode?: number }

export class UsageError extends Error {}

export const need = (value: string | undefined, what: string) => {
  if (!value) throw new UsageError(`Missing ${what}`)
  return value
}

export const settingsFor = (paths: Paths, project?: string): Settings =>
  project ? loadProjectConfig(paths, projectLayout(paths, project).config, project).settings : loadSettings(paths)

export const partsFlag = (flags: Flags) =>
  flags.part
    ?.split(',')
    .map((p) => p.trim())
    .filter(Boolean)

export const rel = (paths: Paths, file: string) => toPosix(path.relative(paths.root, file))

export const serverFor = async (paths: Paths) => findServer(paths, loadSettings(paths).server.port)
