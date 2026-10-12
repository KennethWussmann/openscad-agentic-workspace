import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Document, parseDocument, parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { Paths } from './paths.ts'
import { type DefineValue, EXPORT_FORMATS, type PrintProfile, type Tolerances } from './protocol.ts'

export const DefineValueSchema: z.ZodType<DefineValue> = z.lazy(() =>
  z.union([z.number(), z.string(), z.boolean(), z.array(DefineValueSchema)]),
)

const Defines = z.record(
  z.string().regex(/^\$?[A-Za-z_][A-Za-z0-9_]*$/, 'invalid OpenSCAD variable name'),
  DefineValueSchema,
)

export const OpenscadCommand = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])

const LibrarySchema = z.strictObject({
  git: z.string().min(1),
  ref: z.string().min(1),
})

export type LibrarySpec = z.infer<typeof LibrarySchema>

export const LIBRARY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const Positive = z.number().positive()

export const DEFAULT_PRINTER = 'default'
export const PRINTER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const PRINTER_NAME_MESSAGE = 'printer names use letters, digits, . _ -'

export const FDM_TOLERANCES: Tolerances = { press: 0.2, sliding: 0.3, loose: 0.45, hole: 0.2 }
export const RESIN_TOLERANCES: Tolerances = { press: 0.05, sliding: 0.1, loose: 0.2, hole: 0.1 }

const TolerancesSchema = (d: Tolerances) =>
  z
    .strictObject({
      press: z.number().min(0).default(d.press),
      sliding: z.number().min(0).default(d.sliding),
      loose: z.number().min(0).default(d.loose),
      hole: z.number().min(0).default(d.hole),
    })
    .prefault({})

const BuildVolume = z.tuple([Positive, Positive, Positive])

const FdmPrinterSchema = z.strictObject({
  process: z.literal('fdm'),
  bed: BuildVolume,
  nozzles: z.array(Positive).min(1).default([0.4]),
  layerHeight: Positive.default(0.2),
  overhangAngle: z.number().min(0).max(90).default(45),
  minWall: Positive.nullable().default(null),
  tolerances: TolerancesSchema(FDM_TOLERANCES),
})

const ResinPrinterSchema = z.strictObject({
  process: z.literal('resin'),
  bed: BuildVolume,
  pixel: Positive,
  layerHeight: Positive.default(0.05),
  minWall: Positive.default(0.8),
  minFeature: Positive.default(0.3),
  drainHole: Positive.default(2.5),
  tolerances: TolerancesSchema(RESIN_TOLERANCES),
})

const PrinterSchema = z.discriminatedUnion('process', [FdmPrinterSchema, ResinPrinterSchema])

export type PrinterSpec = z.infer<typeof PrinterSchema>

export const SettingsSchema = z
  .strictObject({
    libraries: z
      .record(z.string().regex(LIBRARY_NAME, 'library names are folder names (letters, digits, . _ -)'), LibrarySchema)
      .default({}),
    openscad: z
      .strictObject({
        path: OpenscadCommand.nullable().default(null),
        backend: z.enum(['manifold', 'cgal']).default('manifold'),
        timeoutSeconds: z.number().positive().default(600),
        enable: z.array(z.string()).default([]),
      })
      .prefault({}),
    render: z
      .strictObject({
        defines: Defines.default({}),
        sheet: z.boolean().default(true),
        sheetSize: z.number().int().min(256).max(4096).default(1200),
        colorscheme: z.string().default('Tomorrow Night'),
      })
      .prefault({}),
    export: z
      .strictObject({
        formats: z.array(z.enum(EXPORT_FORMATS)).min(1).default(['3mf', 'stl']),
        filename: z.string().min(1).default('{project}-{part}'),
      })
      .prefault({}),
    server: z
      .strictObject({
        port: z.number().int().min(1024).max(65535).default(5180),
        open: z.boolean().default(true),
      })
      .prefault({}),
    print: z
      .strictObject({
        printer: z.string().regex(PRINTER_NAME, PRINTER_NAME_MESSAGE).default(DEFAULT_PRINTER),
        nozzle: Positive.nullable().default(null),
        layerHeight: Positive.nullable().default(null),
      })
      .prefault({}),
    printers: z
      .record(z.string().regex(PRINTER_NAME, PRINTER_NAME_MESSAGE), PrinterSchema)
      .prefault({ [DEFAULT_PRINTER]: { process: 'fdm', bed: [256, 256, 256] } }),
    check: z
      .strictObject({
        minRegionArea: z.number().min(0).default(1),
      })
      .prefault({}),
  })
  .superRefine((s, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
    const name = s.print.printer
    const printer = s.printers[name]
    if (!printer) {
      issue(
        ['print', 'printer'],
        `"${name}" is not defined in printers (${Object.keys(s.printers).join(', ') || 'none'})`,
      )
      return
    }
    if (printer.process === 'fdm') {
      const nozzle = s.print.nozzle ?? printer.nozzles[0]
      if (s.print.nozzle !== null && !printer.nozzles.some((n) => Math.abs(n - nozzle) < 1e-9))
        issue(
          ['print', 'nozzle'],
          `${nozzle} mm is not one of printers.${name}.nozzles (${printer.nozzles.join(', ')})`,
        )
      if (printer.minWall !== null && printer.minWall < nozzle)
        issue(['printers', name, 'minWall'], `must be at least the nozzle (${nozzle} mm)`)
    } else {
      if (s.print.nozzle !== null)
        issue(['print', 'nozzle'], `only applies to fdm printers, "${name}" is ${printer.process}; set it to null`)
      if (printer.minFeature < printer.pixel)
        issue(['printers', name, 'minFeature'], `must be at least one pixel (${printer.pixel} mm)`)
      if (printer.minWall < printer.minFeature)
        issue(['printers', name, 'minWall'], `must be at least minFeature (${printer.minFeature} mm)`)
    }
  })

export type Settings = z.infer<typeof SettingsSchema>

export const printProfile = (settings: Settings): PrintProfile => {
  const printer = settings.print.printer
  const p = settings.printers[printer]
  const base = {
    printer,
    bed: p.bed,
    layerHeight: settings.print.layerHeight ?? p.layerHeight,
    tolerances: p.tolerances,
    minRegionArea: settings.check.minRegionArea,
  }
  if (p.process === 'resin')
    return {
      process: 'resin',
      ...base,
      pixel: p.pixel,
      minWall: p.minWall,
      minFeature: p.minFeature,
      drainHole: p.drainHole,
    }
  const nozzle = settings.print.nozzle ?? p.nozzles[0]
  return {
    process: 'fdm',
    ...base,
    nozzle,
    nozzles: p.nozzles,
    overhangAngle: p.overhangAngle,
    minWall: p.minWall ?? 2 * nozzle,
  }
}

const PartSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'part ids are lowercase-dashed'),
  label: z.string().optional(),
  file: z.string().default('src/main.scad'),
  defines: Defines.default({}),
  preview: z.boolean().default(true),
})

export const ProjectMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  parts: z
    .array(PartSchema)
    .min(1)
    .default([{ id: 'main', file: 'src/main.scad', defines: {}, preview: true }])
    .refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, 'part ids must be unique'),
})

export type ProjectMeta = z.infer<typeof ProjectMetaSchema>

export type ProjectConfig = { meta: ProjectMeta; settings: Settings }

const META_KEYS = ['name', 'description', 'parts'] as const

type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

export const deepMerge = (base: Plain, over: Plain): Plain => {
  const out: Plain = { ...base }
  for (const [key, value] of Object.entries(over)) {
    out[key] = isPlain(value) && isPlain(out[key]) ? deepMerge(out[key] as Plain, value) : value
  }
  return out
}

const readYaml = (file: string): Plain => {
  if (!existsSync(file)) return {}
  const data = parseYaml(readFileSync(file, 'utf8')) as unknown
  if (data === null || data === undefined) return {}
  if (!isPlain(data)) throw new Error(`${file} must contain a YAML mapping`)
  return data
}

const formatIssues = (file: string, error: z.ZodError) =>
  `Invalid config in ${file}:\n${error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`

export const ensureRootConfig = (paths: Paths) => {
  if (existsSync(paths.config)) return false
  if (existsSync(paths.configExample)) copyFileSync(paths.configExample, paths.config)
  else writeFileSync(paths.config, '')
  return true
}

const TOP_KEY = /^([A-Za-z_][A-Za-z0-9_]*):/

const exampleBlocks = (text: string) => {
  const lines = text.split(/\r?\n/)
  const starts: { key: string; line: number }[] = []
  lines.forEach((line, i) => {
    const m = line.match(TOP_KEY)
    if (!m) return
    let start = i
    while (start > 0 && lines[start - 1].startsWith('#')) start--
    starts.push({ key: m[1], line: start })
  })
  return starts.map((s, i) => {
    const body = lines.slice(s.line, starts[i + 1]?.line ?? lines.length)
    while (body.length && !body[body.length - 1].trim()) body.pop()
    return { key: s.key, text: body.join('\n') }
  })
}

export const addMissingConfigSections = (paths: Paths): string[] => {
  if (!existsSync(paths.config) || !existsSync(paths.configExample)) return []
  const present = new Set(Object.keys(readYaml(paths.config)))
  const missing = exampleBlocks(readFileSync(paths.configExample, 'utf8')).filter((b) => !present.has(b.key))
  if (!missing.length) return []
  const current = readFileSync(paths.config, 'utf8')
  const sep = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(paths.config, `${current}${sep}${missing.map((b) => `\n${b.text}\n`).join('')}`)
  return missing.map((b) => b.key)
}

const rootRaw = (paths: Paths) => readYaml(paths.config)

export const loadSettings = (paths: Paths): Settings => {
  const parsed = SettingsSchema.safeParse(rootRaw(paths))
  if (!parsed.success) throw new Error(formatIssues(paths.config, parsed.error))
  return parsed.data
}

export const loadProjectConfig = (paths: Paths, projectConfigFile: string, fallbackName: string): ProjectConfig => {
  const raw = readYaml(projectConfigFile)
  const metaRaw: Plain = { name: fallbackName }
  const overrides: Plain = {}
  for (const [key, value] of Object.entries(raw)) {
    if ((META_KEYS as readonly string[]).includes(key)) metaRaw[key] = value
    else overrides[key] = value
  }
  const meta = ProjectMetaSchema.safeParse(metaRaw)
  if (!meta.success) throw new Error(formatIssues(projectConfigFile, meta.error))
  const settings = SettingsSchema.safeParse(deepMerge(rootRaw(paths), overrides))
  if (!settings.success) throw new Error(formatIssues(`${paths.config} + ${projectConfigFile}`, settings.error))
  return { meta: meta.data, settings: settings.data }
}

export const setYamlValue = (file: string, keyPath: string[], value: unknown) => {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const parsed = parseDocument(text)
  const doc: Document = isPlain(parsed.toJS()) ? parsed : new Document({})
  doc.setIn(keyPath, value)
  writeFileSync(file, doc.toString())
}

export const deleteYamlValue = (file: string, keyPath: string[]) => {
  if (!existsSync(file)) return
  const doc = parseDocument(readFileSync(file, 'utf8'))
  doc.deleteIn(keyPath)
  writeFileSync(file, doc.toString())
}

export const writeOpenscadPath = (paths: Paths, command: string | string[]) => {
  ensureRootConfig(paths)
  setYamlValue(paths.config, ['openscad', 'path'], command)
}
