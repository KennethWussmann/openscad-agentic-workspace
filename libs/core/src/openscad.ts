import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Settings } from './config.ts'
import { vendorRoot } from './libraries.ts'
import type { Paths } from './paths.ts'
import type { DefineValue, Diagnostic, DiagnosticLevel } from './protocol.ts'

const LEVELS: Record<string, DiagnosticLevel> = {
  ERROR: 'error',
  'EXPORT-ERROR': 'error',
  WARNING: 'warning',
  'UI-WARNING': 'warning',
  'FONT-WARNING': 'warning',
  'EXPORT-WARNING': 'warning',
  DEPRECATED: 'deprecated',
  TRACE: 'trace',
  ECHO: 'echo',
}

const PREFIX = /^([A-Z-]+): (.*)$/
const LOCATION = /^(.*?),? in file (.+?), line (\d+)\.?$/
const FATAL = [/^Current top level object is (empty|not a 3D object|not a 2D object)/]

export const parseDiagnostics = (stderr: string, ok: boolean): Diagnostic[] => {
  const out: Diagnostic[] = []
  for (const raw of stderr.split(/\r?\n/)) {
    const line = raw.trim()
    const prefixed = line.match(PREFIX)
    const level = prefixed ? LEVELS[prefixed[1]] : undefined
    if (prefixed && level) {
      const body = prefixed[2]
      const located = body.match(LOCATION)
      out.push(
        located
          ? { level, message: located[1], file: located[2].replace(/^"|"$/g, ''), line: Number(located[3]) }
          : { level, message: body },
      )
      continue
    }
    if (!ok && FATAL.some((re) => re.test(line))) out.push({ level: 'error', message: line })
  }
  if (!ok && !out.some((d) => d.level === 'error')) {
    const last = stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop()
    out.push({ level: 'error', message: last ?? 'OpenSCAD failed without output' })
  }
  return out
}

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

export const runOpenscad = ({ command, args, cwd, paths, settings }: RunOptions) =>
  new Promise<RunResult>((resolve) => {
    const started = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(command[0], [...command.slice(1), ...args], {
      cwd,
      env: { ...process.env, OPENSCADPATH: openscadPathEnv(paths, settings) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, settings.openscad.timeoutSeconds * 1000)
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({
        code: null,
        stdout,
        stderr: `${stderr}\nERROR: ${e.message}`,
        timedOut,
        durationMs: Date.now() - started,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const tail = timedOut ? `\nERROR: OpenSCAD timed out after ${settings.openscad.timeoutSeconds}s` : ''
      resolve({ code, stdout, stderr: stderr + tail, timedOut, durationMs: Date.now() - started })
    })
  })

export const parseDepsFile = (content: string): string[] => {
  const colon = content.search(/:(\s|$)/)
  const body = (colon >= 0 ? content.slice(colon + 1) : content).replace(/\\\r?\n/g, ' ')
  return body
    .split(/(?<!\\)\s+/)
    .map((p) => p.replace(/\\ /g, ' ').trim())
    .filter(Boolean)
}
