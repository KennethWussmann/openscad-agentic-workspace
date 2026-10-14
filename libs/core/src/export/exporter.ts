import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  type CheckResult,
  DEFAULT_SET,
  type DefineValue,
  type Diagnostic,
  type ExportedFile,
  type ExportFormat,
  type ExportResult,
  type PartDef,
  type PrintProfile,
} from '@scad/protocol'
import { checkModel, checkResult } from '../check/checker.ts'
import { loadProjectConfig } from '../config/load.ts'
import { printProfile } from '../config/profile.ts'
import { writeJsonAtomic } from '../fs/json.ts'
import { parseDiagnostics } from '../openscad/diagnostics.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { baseArgs, defineArgs, runOpenscad } from '../openscad/run.ts'
import { isRenderCurrent, readRender } from '../render/store.ts'
import { effectiveDefines, resolveSet, setParts } from '../sets/sets.ts'
import { listVersions } from '../versions/versions.ts'
import { renderView, VIEWS } from '../views/views.ts'
import { type Paths, projectLayout, toPosix } from '../workspace/paths.ts'

export type ExportOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  formats?: ExportFormat[]
  parts?: string[]
  overrides?: Record<string, DefineValue>
  sets?: string[]
  meshCheck?: boolean
}

const MULTI: ExportFormat[] = ['3mf', 'obj', 'off', 'wrl', 'csg', 'svg', 'dxf', 'pdf']

export const fileName = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match).replace(/[\\/:*?"<>|]/g, '_')

export type FileNameValues = { project: string; part: string; version: string; set: string }

export const exportBaseName = (template: string, values: FileNameValues, tweaked: boolean) => {
  const setSuffix = !template.includes('{set}') && values.set !== DEFAULT_SET ? `-${values.set}` : ''
  return `${fileName(template, values)}${setSuffix}${tweaked ? '-tweaked' : ''}`
}

export const currentVersionLabel = (paths: Paths, project: string) => {
  const render = readRender(paths, project)
  const latest = listVersions(paths, project).at(-1)
  if (latest && isRenderCurrent(paths, render) && JSON.stringify(render?.inputs) === JSON.stringify(latest.inputs))
    return latest.id
  return 'wip'
}

const checkExports = (
  project: string,
  files: ExportedFile[],
  defs: PartDef[],
  profile: PrintProfile,
  exportedAt: string,
): CheckResult | null => {
  const parts = files
    .filter((f) => f.ok && f.format === '3mf')
    .map((f) => checkModel(f.file, { id: f.part, label: defs.find((d) => d.id === f.part)?.label }, profile))
  return parts.length ? checkResult(project, parts, profile, exportedAt) : null
}

export const exportProject = async (opts: ExportOptions): Promise<ExportResult> => {
  const { paths, project, openscad } = opts
  const layout = projectLayout(paths, project)
  const config = loadProjectConfig(paths, layout.config, project)
  const formats = opts.formats ?? config.settings.export.formats
  const selected = config.meta.parts.filter((p) => !opts.parts || opts.parts.includes(p.id))
  const sets = [...new Set(opts.sets?.length ? opts.sets : [DEFAULT_SET])].map((name) => ({
    name,
    set: resolveSet(config.meta, name),
  }))
  const overrides = opts.overrides ?? {}
  const tweaked = Object.keys(overrides).length > 0
  const version = tweaked ? 'tweaked' : currentVersionLabel(paths, project)
  mkdirSync(layout.out, { recursive: true })
  const files: ExportedFile[] = []
  const settings = config.settings
  for (const { name: setName, set } of sets)
    for (const part of setParts(selected, set)) {
      const abs = path.resolve(layout.dir, part.file)
      const base = exportBaseName(settings.export.filename, { project, part: part.id, version, set: setName }, tweaked)
      const target = (ext: string) => path.join(layout.out, `${base}.${ext}`)
      const defines = effectiveDefines(settings, set, overrides, part)
      const run = async (outputs: string[], exportFormat: string | null) => {
        const result = await runOpenscad({
          command: openscad.command,
          args: [
            ...baseArgs(settings),
            ...outputs.flatMap((o) => ['-o', o]),
            ...(exportFormat ? ['--export-format', exportFormat] : []),
            ...defineArgs(defines),
            abs,
          ],
          cwd: layout.dir,
          paths,
          settings,
        })
        return { ok: result.code === 0, diagnostics: parseDiagnostics(result.stderr, result.code === 0) }
      }
      const add = (format: ExportFormat, file: string, ok: boolean, diagnostics: Diagnostic[]) =>
        files.push({ part: part.id, set: setName, format, file, ok, diagnostics })
      const multi = formats.filter((f) => MULTI.includes(f))
      if (multi.length) {
        const outputs = multi.map((f) => target(f))
        const result = await run(outputs, null)
        multi.forEach((format, i) => {
          add(format, outputs[i], result.ok && existsSync(outputs[i]), result.diagnostics)
        })
      }
      if (formats.includes('stl')) {
        const file = target('stl')
        const result = await run([file], 'binstl')
        add('stl', file, result.ok && existsSync(file), result.diagnostics)
      }
      if (formats.includes('asciistl')) {
        const file = target(formats.includes('stl') ? 'ascii.stl' : 'stl')
        const result = await run([file], 'asciistl')
        add('asciistl', file, result.ok && existsSync(file), result.diagnostics)
      }
      if (formats.includes('png')) {
        const file = target('png')
        const model = path.join(layout.out, `${base}.3mf`)
        const tmpModel = existsSync(model) ? null : path.join(layout.temp, `export-${setName}-${part.id}.3mf`)
        let diagnostics: Diagnostic[] = []
        if (tmpModel) diagnostics = (await run([tmpModel], null)).diagnostics
        const size = settings.render.sheetSize
        diagnostics.push(
          ...(await renderView(
            { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
            { models: [tmpModel ?? model], rotation: [...VIEWS.iso], width: size, height: size, out: file },
          )),
        )
        add('png', file, existsSync(file), diagnostics)
      }
    }
  const exportedAt = new Date().toISOString()
  const result: ExportResult = {
    project,
    version,
    outDir: layout.out,
    exportedAt,
    overrides,
    sets: sets.map((s) => s.name),
    files: files.map((f) => ({ ...f, file: toPosix(path.relative(layout.dir, f.file)) })),
    meshCheck: opts.meshCheck ? checkExports(project, files, selected, printProfile(settings), exportedAt) : null,
  }
  writeJsonAtomic(path.join(layout.out, 'export.json'), result)
  return result
}
