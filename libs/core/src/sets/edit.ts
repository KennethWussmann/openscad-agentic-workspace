import { readFileSync } from 'node:fs'
import {
  ALL_SETS,
  type DefineValue,
  type ParamDef,
  type ParamSet,
  type SaveSetInput,
  setNameProblem,
} from '@scad/protocol'
import { type Document, isMap, isScalar, parseDocument, type YAMLMap } from 'yaml'
import { parseProjectConfig } from '../config/load.ts'
import type { ProjectConfig } from '../config/schema.ts'
import { isPlain } from '../config/yaml.ts'
import { writeTextAtomic } from '../fs/json.ts'
import { type Paths, projectLayout } from '../workspace/paths.ts'
import { type NativeSync, syncNativeSets } from './native.ts'
import { requireSet } from './sets.ts'
import { formatSetIssue, validateSets } from './validate.ts'

const PARAM_NAME = /^\$?[A-Za-z_][A-Za-z0-9_]*$/

export type SetMutation = { config: ProjectConfig; native: NativeSync[] }

const editConfig = (paths: Paths, project: string, mutate: (doc: Document, config: ProjectConfig) => void) => {
  const layout = projectLayout(paths, project)
  const doc = parseDocument(readFileSync(layout.config, 'utf8'))
  if (doc.errors.length) throw new Error(`Cannot edit ${layout.config}: ${doc.errors[0].message}`)
  const before = doc.toJS() as unknown
  mutate(doc, parseProjectConfig(paths, isPlain(before) ? before : {}, layout.config, project))
  const after = doc.toJS() as unknown
  const config = parseProjectConfig(paths, isPlain(after) ? after : {}, layout.config, project)
  writeTextAtomic(layout.config, doc.toString())
  return { config, native: syncNativeSets(paths, project, true) } satisfies SetMutation
}

const setsMap = (doc: Document) => {
  const node = doc.get('sets', true)
  if (isMap(node)) {
    if (node.flow && node.items.length === 0) node.flow = false
    return node
  }
  const created = doc.createNode({}) as YAMLMap
  doc.set('sets', created)
  return created
}

const assertValid = (config: ProjectConfig, name: string, values: Record<string, DefineValue>, params: ParamDef[]) => {
  const bad = Object.keys(values).filter((k) => !PARAM_NAME.test(k))
  if (bad.length) throw new Error(`Invalid parameter name(s): ${bad.join(', ')}`)
  const set: ParamSet = { ...(config.meta.sets[name] ?? { export: false }), values }
  const issues = validateSets({ ...config.meta, sets: { [name]: set } }, params)
  if (issues.length)
    throw new Error(`Set "${name}" not saved:\n${issues.map((i) => `  - ${formatSetIssue(i)}`).join('\n')}`)
}

export type SaveSetOptions = SaveSetInput & { paths: Paths; project: string; params: ParamDef[] }

export const saveSet = (
  opts: SaveSetOptions,
): SetMutation & { created: boolean; values: Record<string, DefineValue> } => {
  const { paths, project, name, params } = opts
  const problem = setNameProblem(name)
  if (problem) throw new Error(`Invalid set name "${name}": ${problem}`)
  let created = false
  let values: Record<string, DefineValue> = {}
  const result = editConfig(paths, project, (doc, config) => {
    const existing = config.meta.sets[name]
    created = !existing
    values = existing && !opts.replace ? { ...existing.values, ...opts.values } : { ...opts.values }
    if (!Object.keys(values).length) throw new Error(`Set "${name}" needs at least one value`)
    assertValid(config, name, values, params)
    const sets = setsMap(doc)
    if (!existing) {
      const node = doc.createNode({
        ...(opts.label ? { label: opts.label } : {}),
        values,
        ...(opts.export ? { export: true } : {}),
      }) as YAMLMap
      const valuesNode = node.get('values', true)
      if (isMap(valuesNode)) valuesNode.flow = true
      sets.set(name, node)
      return
    }
    const valuesNode = doc.getIn(['sets', name, 'values'], true)
    if (opts.replace || !isMap(valuesNode)) {
      const replacement = doc.createNode(values) as YAMLMap
      replacement.flow = isMap(valuesNode) ? Boolean(valuesNode.flow) : true
      doc.setIn(['sets', name, 'values'], replacement)
    } else for (const [key, value] of Object.entries(opts.values)) doc.setIn(['sets', name, 'values', key], value)
    if (opts.label !== undefined) {
      if (opts.label) doc.setIn(['sets', name, 'label'], opts.label)
      else doc.deleteIn(['sets', name, 'label'])
    }
    if (opts.export === true) doc.setIn(['sets', name, 'export'], true)
    if (opts.export === false) doc.deleteIn(['sets', name, 'export'])
  })
  return { ...result, created, values }
}

const dropEmptySets = (doc: Document) => {
  const node = doc.get('sets', true)
  if (isMap(node) && node.items.length === 0) doc.delete('sets')
}

export const removeSet = (paths: Paths, project: string, name: string) =>
  editConfig(paths, project, (doc, config) => {
    requireSet(config.meta, name)
    doc.deleteIn(['sets', name])
    dropEmptySets(doc)
  })

const targetSets = (config: ProjectConfig, name: string) =>
  name === ALL_SETS ? Object.keys(config.meta.sets) : [requireSet(config.meta, name).name]

export const unsetParams = (paths: Paths, project: string, name: string, params: string[]) => {
  const changed: string[] = []
  const result = editConfig(paths, project, (doc, config) => {
    const names = targetSets(config, name)
    const missing = params.filter((p) => !names.some((n) => p in config.meta.sets[n].values))
    if (missing.length)
      throw new Error(`Not in ${name === ALL_SETS ? 'any set' : `set "${name}"`}: ${missing.join(', ')}`)
    for (const n of names)
      for (const p of params)
        if (p in config.meta.sets[n].values) {
          doc.deleteIn(['sets', n, 'values', p])
          if (!changed.includes(n)) changed.push(n)
        }
  })
  return { ...result, changed }
}

export const renameParam = (paths: Paths, project: string, from: string, to: string) => {
  if (!PARAM_NAME.test(to)) throw new Error(`Invalid parameter name "${to}"`)
  const changed: string[] = []
  const result = editConfig(paths, project, (doc, config) => {
    for (const [name, set] of Object.entries(config.meta.sets)) {
      if (!(from in set.values)) continue
      if (to in set.values) throw new Error(`Set "${name}" already has "${to}"; unset one of them first`)
      const values = doc.getIn(['sets', name, 'values'], true)
      const pair = isMap(values) ? values.items.find((p) => isScalar(p.key) && p.key.value === from) : undefined
      if (pair && isScalar(pair.key)) pair.key.value = to
      changed.push(name)
    }
    if (!changed.length) throw new Error(`No set uses "${from}"`)
  })
  return { ...result, changed }
}
