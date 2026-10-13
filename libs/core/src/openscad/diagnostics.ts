import type { Diagnostic, DiagnosticLevel } from '@scad/protocol'

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
