import type { DefineValue, ParamDef, ProjectState } from '@scad/protocol'
import { sameJson } from './format.ts'

type Values = Record<string, DefineValue>

const NONE: Values = {}

export const setValues = (project: ProjectState | null, name: string | null): Values =>
  (name && project?.sets[name]?.values) || NONE

export const overridesOf = (setVals: Values, edits: Values): Values =>
  Object.keys(edits).length ? { ...setVals, ...edits } : setVals

export const withoutDefaults = (values: Values, params: ParamDef[]): Values =>
  Object.fromEntries(
    Object.entries(values).filter(([name, value]) => {
      const def = params.find((p) => p.name === name)
      return !def || !sameJson(def.initial, value)
    }),
  )

export const slugify = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export const fmtValue = (v: DefineValue) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v))
