import path from 'node:path'
import type { DefineValue } from '@scad/protocol'
import type { Settings } from '../config/schema.ts'
import { vendorRoot } from '../libraries/vendor.ts'
import { runProcess } from '../process/run.ts'
import type { Paths } from '../workspace/paths.ts'

export const formatDefine = (name: string, value: DefineValue) => `${name}=${JSON.stringify(value)}`

export const defineArgs = (defines: Record<string, DefineValue>) =>
  Object.entries(defines).flatMap(([name, value]) => ['-D', formatDefine(name, value)])

export const openscadPathEnv = (paths: Paths, settings: Settings) => {
  const own = [paths.libs, ...Object.entries(settings.libraries).map(([name, spec]) => vendorRoot(paths, name, spec))]
  const inherited = process.env.OPENSCADPATH ? process.env.OPENSCADPATH.split(path.delimiter) : []
  return [...own, ...inherited].join(path.delimiter)
}

export type RunResult = {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

export type RunOptions = {
  command: string[]
  args: string[]
  cwd: string
  paths: Paths
  settings: Settings
}

export const baseArgs = (settings: Settings) => [
  '--backend',
  settings.openscad.backend === 'cgal' ? 'CGAL' : 'Manifold',
  ...settings.openscad.enable.flatMap((f) => ['--enable', f]),
]

export const runOpenscad = async ({ command, args, cwd, paths, settings }: RunOptions): Promise<RunResult> => {
  const timeout = settings.openscad.timeoutSeconds
  const run = await runProcess({
    command: command[0],
    args: [...command.slice(1), ...args],
    cwd,
    env: { ...process.env, OPENSCADPATH: openscadPathEnv(paths, settings) },
    timeoutMs: timeout * 1000,
  })
  const tail = run.error
    ? `\nERROR: ${run.error.message}`
    : run.timedOut
      ? `\nERROR: OpenSCAD timed out after ${timeout}s`
      : ''
  return {
    code: run.code,
    stdout: run.stdout,
    stderr: run.stderr + tail,
    timedOut: run.timedOut,
    durationMs: run.durationMs,
  }
}

export const parseDepsFile = (content: string): string[] => {
  const colon = content.search(/:(\s|$)/)
  const body = (colon >= 0 ? content.slice(colon + 1) : content).replace(/\\\r?\n/g, ' ')
  return body
    .split(/(?<!\\)\s+/)
    .map((p) => p.replace(/\\ /g, ' ').trim())
    .filter(Boolean)
}
