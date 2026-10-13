import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Document, parseDocument, parse as parseYaml } from 'yaml'

export type Plain = Record<string, unknown>

export const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

export const deepMerge = (base: Plain, over: Plain): Plain => {
  const out: Plain = { ...base }
  for (const [key, value] of Object.entries(over)) {
    out[key] = isPlain(value) && isPlain(out[key]) ? deepMerge(out[key] as Plain, value) : value
  }
  return out
}

export const readYaml = (file: string): Plain => {
  if (!existsSync(file)) return {}
  const data = parseYaml(readFileSync(file, 'utf8')) as unknown
  if (data === null || data === undefined) return {}
  if (!isPlain(data)) throw new Error(`${file} must contain a YAML mapping`)
  return data
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
