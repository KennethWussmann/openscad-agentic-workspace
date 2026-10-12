import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { type ExportFormat, loadProjectConfig } from './config.ts'
import type { Openscad } from './discovery.ts'
import { baseArgs, defineArgs, parseDiagnostics, runOpenscad } from './openscad.ts'
import { type Paths, projectLayout, toPosix } from './paths.ts'
import type { DefineValue, Diagnostic } from './protocol.ts'
import { isRenderCurrent, readRender, writeJsonAtomic } from './render.ts'
import { listVersions } from './versions.ts'
import { renderView, VIEWS } from './views.ts'

export type ExportOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  formats?: ExportFormat[]
  parts?: string[]
}

export type ExportedFile = {
  part: string
  format: ExportFormat
  file: string
  ok: boolean
  diagnostics: Diagnostic[]
}

export type ExportResult = {
  project: string
  version: string
  outDir: string
  files: ExportedFile[]
}

const MULTI: ExportFormat[] = ['3mf', 'obj', 'off', 'wrl', 'csg', 'svg', 'dxf', 'pdf']

export const fileName = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match).replace(/[\\/:*?"<>|]/g, '_')

export const currentVersionLabel = (paths: Paths, project: string) => {
  const render = readRender(paths, project)
  const latest = listVersions(paths, project).at(-1)
  if (latest && isRenderCurrent(paths, render) && JSON.stringify(render?.inputs) === JSON.stringify(latest.inputs))
    return latest.id
  return 'wip'
}

export const exportProject = async (opts: ExportOptions): Promise<ExportResult> => {
  const { paths, project, openscad } = opts
  const layout = projectLayout(paths, project)
  const config = loadProjectConfig(paths, layout.config, project)
  const formats = opts.formats ?? config.settings.export.formats
  const parts = config.meta.parts.filter((p) => !opts.parts || opts.parts.includes(p.id))
  const version = currentVersionLabel(paths, project)
  mkdirSync(layout.out, { recursive: true })
  const files: ExportedFile[] = []
  const settings = config.settings
  for (const part of parts) {
    const abs = path.resolve(layout.dir, part.file)
    const base = fileName(settings.export.filename, { project, part: part.id, version })
    const target = (ext: string) => path.join(layout.out, `${base}.${ext}`)
    const defines: Record<string, DefineValue> = { ...settings.render.defines, ...part.defines }
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
    const multi = formats.filter((f) => MULTI.includes(f))
    if (multi.length) {
      const outputs = multi.map((f) => target(f))
      const result = await run(outputs, null)
      multi.forEach((format, i) => {
        files.push({
          part: part.id,
          format,
          file: outputs[i],
          ok: result.ok && existsSync(outputs[i]),
          diagnostics: result.diagnostics,
        })
      })
    }
    if (formats.includes('stl')) {
      const file = target('stl')
      const result = await run([file], 'binstl')
      files.push({
        part: part.id,
        format: 'stl',
        file,
        ok: result.ok && existsSync(file),
        diagnostics: result.diagnostics,
      })
    }
    if (formats.includes('asciistl')) {
      const file = target(formats.includes('stl') ? 'ascii.stl' : 'stl')
      const result = await run([file], 'asciistl')
      files.push({
        part: part.id,
        format: 'asciistl',
        file,
        ok: result.ok && existsSync(file),
        diagnostics: result.diagnostics,
      })
    }
    if (formats.includes('png')) {
      const file = target('png')
      const model = path.join(layout.out, `${base}.3mf`)
      const tmpModel = existsSync(model) ? null : path.join(layout.temp, `export-${part.id}.3mf`)
      let diagnostics: Diagnostic[] = []
      if (tmpModel) diagnostics = (await run([tmpModel], null)).diagnostics
      const size = settings.render.sheetSize
      diagnostics.push(
        ...(await renderView(
          { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
          { models: [tmpModel ?? model], rotation: [...VIEWS.iso], width: size, height: size, out: file },
        )),
      )
      files.push({ part: part.id, format: 'png', file, ok: existsSync(file), diagnostics })
    }
  }
  const result: ExportResult = {
    project,
    version,
    outDir: layout.out,
    files: files.map((f) => ({ ...f, file: toPosix(path.relative(layout.dir, f.file)) })),
  }
  writeJsonAtomic(path.join(layout.out, 'export.json'), { ...result, exportedAt: new Date().toISOString() })
  return result
}
