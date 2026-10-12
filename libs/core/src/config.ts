import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Document, parseDocument, parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { Paths } from './paths.ts'
import type { DefineValue } from './protocol.ts'

export const EXPORT_FORMATS = [
  '3mf',
  'stl',
  'asciistl',
  'obj',
  'off',
  'wrl',
  'png',
  'svg',
  'dxf',
  'pdf',
  'csg',
] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

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

export const SettingsSchema = z.strictObject({
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
})

export type Settings = z.infer<typeof SettingsSchema>

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
