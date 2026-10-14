import type { DefineValue, ParamDef, SetIssue } from '@scad/protocol'
import type { ProjectMeta } from '../config/schema.ts'
import { sameValue } from '../openscad/params.ts'
import { setAppliesTo } from './sets.ts'

const show = (v: DefineValue) => JSON.stringify(v)

const elementType = (v: DefineValue) => (Array.isArray(v) ? 'vector' : typeof v)

export const valueProblem = (def: ParamDef, value: DefineValue): string | null => {
  if (def.options?.length && !def.options.some((o) => sameValue(o.value, value)))
    return `${show(value)} is not one of ${def.options.map((o) => show(o.value)).join(', ')}`
  if (def.type === 'boolean') return typeof value === 'boolean' ? null : `${show(value)} is not a boolean`
  if (def.type === 'string') return typeof value === 'string' ? null : `${show(value)} is not a string`
  if (def.type === 'vector') {
    if (!Array.isArray(value)) return `${show(value)} is not a vector`
    const initial = Array.isArray(def.initial) ? def.initial : []
    if (initial.length && value.length !== initial.length)
      return `${show(value)} has ${value.length} elements, expected ${initial.length}`
    const bad = value.findIndex((v, i) => i < initial.length && elementType(v) !== elementType(initial[i]))
    return bad >= 0 ? `element ${bad} of ${show(value)} should be a ${elementType(initial[bad])}` : null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${show(value)} is not a number`
  if (def.min !== undefined && value < def.min) return `${value} is below the minimum ${def.min}`
  if (def.max !== undefined && value > def.max) return `${value} is above the maximum ${def.max}`
  return null
}

export const validateSets = (meta: ProjectMeta, params: ParamDef[]): SetIssue[] => {
  const byName = new Map(params.map((p) => [p.name, p]))
  const issues: SetIssue[] = []
  for (const [set, def] of Object.entries(meta.sets)) {
    const parts = meta.parts.filter((p) => setAppliesTo(def, p.id))
    for (const [param, value] of Object.entries(def.values)) {
      const issue = (message: string) => issues.push({ set, param, message: `${param}: ${message}` })
      const known = byName.get(param)
      if (known) {
        const problem = valueProblem(known, value)
        if (problem) issue(problem)
        continue
      }
      const definedBy = parts.filter((p) => param in p.defines)
      if (definedBy.length && definedBy.length === parts.length)
        issue(`always overridden by parts[].defines of ${definedBy.map((p) => p.id).join(', ')}`)
      else if (!definedBy.length && !param.startsWith('$'))
        issue(
          `not a customizer parameter of ${[...new Set(parts.map((p) => p.file))].join(', ')} (OpenSCAD ignores it)`,
        )
    }
  }
  return issues
}

export const formatSetIssue = (issue: SetIssue) => `set "${issue.set}": ${issue.message}`
