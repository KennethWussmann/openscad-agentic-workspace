import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { z } from 'zod'
import type { Paths } from '../workspace/paths.ts'
import { type ProjectConfig, ProjectMetaSchema, type Settings, SettingsSchema } from './schema.ts'
import { deepMerge, type Plain, readYaml, setYamlValue } from './yaml.ts'

const META_KEYS = ['name', 'description', 'parts', 'sets'] as const

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

export const loadProjectConfig = (paths: Paths, projectConfigFile: string, fallbackName: string): ProjectConfig =>
  parseProjectConfig(paths, readYaml(projectConfigFile), projectConfigFile, fallbackName)

export const parseProjectConfig = (
  paths: Paths,
  raw: Plain,
  projectConfigFile: string,
  fallbackName: string,
): ProjectConfig => {
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

export const writeOpenscadPath = (paths: Paths, command: string | string[]) => {
  ensureRootConfig(paths)
  setYamlValue(paths.config, ['openscad', 'path'], command)
}
