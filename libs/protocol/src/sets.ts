import type { DefineValue } from './render.ts'

export const DEFAULT_SET = 'default'
export const ALL_SETS = 'all'
export const RESERVED_SET_NAMES: readonly string[] = [DEFAULT_SET, ALL_SETS]
export const SET_NAME = /^[a-z0-9][a-z0-9-]*$/

export const setNameProblem = (name: string, existing: string[] = []) => {
  if (!SET_NAME.test(name)) return 'use lowercase letters, digits and dashes'
  if (RESERVED_SET_NAMES.includes(name)) return `"${name}" is reserved`
  if (existing.includes(name)) return `a set named "${name}" already exists`
  return null
}

export type ParamSet = {
  label?: string
  values: Record<string, DefineValue>
  export: boolean
  parts?: string[]
}

export type ParamSets = Record<string, ParamSet>

export type SetIssue = {
  set: string
  param: string | null
  message: string
}

export type SaveSetInput = {
  name: string
  label?: string
  values: Record<string, DefineValue>
  export?: boolean
  replace?: boolean
}

export type SetsResponse = {
  ok: true
  sets: ParamSets
  issues: SetIssue[]
}
