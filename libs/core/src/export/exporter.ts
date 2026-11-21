import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import {
  type AssemblyDef,
  type BBox,
  type CheckResult,
  DEFAULT_SET,
  type DefineValue,
  type Diagnostic,
  type ExportedFile,
  type ExportFormat,
  type ExportResult,
  type PartDef,
  type PrintProfile,
  type Vec3,
} from '@scad/protocol'
import { checkModel, checkResult } from '../check/checker.ts'
import { loadProjectConfig } from '../config/load.ts'
import { printProfile } from '../config/profile.ts'
import { writeJsonAtomic } from '../fs/json.ts'
import { merge3mf, name3mf } from '../mesh/model3mf.ts'
import { parseDiagnostics } from '../openscad/diagnostics.ts'
import type { Openscad } from '../openscad/discovery.ts'
import { baseArgs, defineArgs, runOpenscad } from '../openscad/run.ts'
import { ASSEMBLY_PART_DEFINE } from '../render/assembly.ts'
import { renderPart } from '../render/part.ts'
import { concurrency, pool } from '../render/pool.ts'
import { isRenderCurrent, readRender } from '../render/store.ts'
import { type ActiveSet, effectiveDefines, resolveSet, setParts } from '../sets/sets.ts'
import { listVersions } from '../versions/versions.ts'
import { renderView, VIEWS } from '../views/views.ts'
import { type Paths, projectLayout, toPosix } from '../workspace/paths.ts'

export type ExportOptions = {
  paths: Paths
  project: string
  openscad: Openscad
  formats?: ExportFormat[]
  parts?: string[]
  assemblies?: string[]
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

export const exportTitle = (
  project: string,
  part: Pick<PartDef, 'id' | 'label'>,
  multiPart: boolean,
  set: ActiveSet | null,
  tweaked: boolean,
) =>
  [
    project,
    part.label ?? (multiPart ? part.id : null),
    set ? (set.def.label ?? set.name) : null,
    tweaked ? 'tweaked' : null,
  ]
    .filter(Boolean)
    .join(' - ')

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
    .filter((f) => f.ok && f.format === '3mf' && !f.assembly)
    .map((f) => checkModel(f.file, { id: f.part, label: defs.find((d) => d.id === f.part)?.label }, profile))
  return parts.length ? checkResult(project, parts, profile, exportedAt) : null
}

const unionBBox = (boxes: (BBox | null)[]): BBox | null => {
  const real = boxes.filter((b): b is BBox => b !== null)
  if (!real.length) return null
  const min = [0, 1, 2].map((k) => Math.min(...real.map((b) => b.min[k]))) as Vec3
  const max = [0, 1, 2].map((k) => Math.max(...real.map((b) => b.max[k]))) as Vec3
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}

const exportAssembly = async (
  opts: ExportOptions,
  layout: ReturnType<typeof projectLayout>,
  config: ReturnType<typeof loadProjectConfig>,
  assembly: AssemblyDef,
  set: ActiveSet | null,
  setName: string,
  overrides: Record<string, DefineValue>,
  tweaked: boolean,
  version: string,
): Promise<ExportedFile | null> => {
  const { paths, project, openscad } = opts
  const settings = config.settings
  const base = exportBaseName(settings.export.filename, { project, part: assembly.id, version, set: setName }, tweaked)
  const target = path.join(layout.out, `${base}.3mf`)
  const fail = (message: string): ExportedFile => ({
    part: assembly.id,
    set: setName,
    format: '3mf',
    file: target,
    ok: false,
    assembly: true,
    diagnostics: [{ level: 'error', message }],
  })
  const work = path.join(layout.temp, `export-assembly-${setName}-${assembly.id}`)
  mkdirSync(work, { recursive: true })
  try {
    const ctx = {
      paths,
      openscad,
      config,
      dir: layout.dir,
      work,
      outDir: work,
      set,
      overrides,
      deps: new Set<string>(),
    }
    const rendered = await pool(setParts(config.meta.parts, set), concurrency(), (part) =>
      renderPart(
        ctx,
        { ...part, file: assembly.file, defines: { ...assembly.defines, [ASSEMBLY_PART_DEFINE]: part.id } },
        undefined,
      ),
    )
    const included = rendered.filter((p) => p.model)
    if (!included.length) return fail(`assembly ${assembly.id} produced no geometry`)
    const box = unionBBox(included.map((p) => p.bbox))
    const bed = printProfile(settings).bed
    if (box?.size.some((s, i) => s > bed[i] + 1e-6))
      return fail(
        `assembly ${assembly.id} does not fit the build volume: ${box.size.map((v) => v.toFixed(2)).join(' x ')} mm against ${bed.join(' x ')} mm`,
      )
    merge3mf(
      target,
      exportTitle(config.meta.name, assembly, true, set, tweaked),
      included.map((p) => ({ file: path.join(layout.dir, p.model as string), name: p.label ?? p.id })),
    )
    return {
      part: assembly.id,
      set: setName,
      format: '3mf',
      file: target,
      ok: true,
      assembly: true,
      diagnostics: included.flatMap((p) => p.diagnostics),
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export const exportProject = async (opts: ExportOptions): Promise<ExportResult> => {
  const { paths, project, openscad } = opts
  const layout = projectLayout(paths, project)
  const config = loadProjectConfig(paths, layout.config, project)
  const formats = opts.formats ?? config.settings.export.formats
  const selected = config.meta.parts.filter((p) => !opts.parts || opts.parts.includes(p.id))
  const assemblies = opts.assemblies?.length
    ? config.meta.assemblies.filter((a) => opts.assemblies?.includes(a.id))
    : config.meta.assemblies.filter((a) => a.export)
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
          const ok = result.ok && existsSync(outputs[i])
          if (ok && format === '3mf')
            name3mf(outputs[i], exportTitle(config.meta.name, part, config.meta.parts.length > 1, set, tweaked))
          add(format, outputs[i], ok, result.diagnostics)
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
  for (const { name: setName, set } of sets)
    for (const assembly of assemblies) {
      const exported = await exportAssembly(opts, layout, config, assembly, set, setName, overrides, tweaked, version)
      if (exported) files.push(exported)
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
