import { type DefineValue, formatQuantity, type ParamDef, type ProjectState, UNITS, type Unit } from '@scad/protocol'
import { sameJson } from './format.ts'
import { BROWSER_LOCALE } from './locale.ts'

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

export const fmtValue = (v: DefineValue, unit?: Unit, locale = BROWSER_LOCALE) => {
  if (typeof v === 'string') return `"${v}"`
  if (typeof v === 'number') return formatQuantity(v, unit, locale)
  return unit ? `${JSON.stringify(v)} ${UNITS[unit].label}` : JSON.stringify(v)
}
