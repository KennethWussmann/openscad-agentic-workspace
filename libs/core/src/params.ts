import type { DefineValue, ParamDef, ParamOption } from './protocol.ts'

type RawParam = {
  name: string
  type?: string
  initial: DefineValue
  caption?: string
  group?: string
  min?: number
  max?: number
  step?: number
  options?: ParamOption[]
}

export const parseParamExport = (json: string): ParamDef[] => {
  const data = JSON.parse(json) as { parameters?: RawParam[] }
  return (data.parameters ?? []).map((p) => {
    const type: ParamDef['type'] = Array.isArray(p.initial)
      ? 'vector'
      : p.type === 'boolean'
        ? 'boolean'
        : p.type === 'string'
          ? 'string'
          : 'number'
    const def: ParamDef = { name: p.name, type, initial: p.initial }
    if (p.caption) def.caption = p.caption
    if (p.group && p.group !== 'Parameters') def.group = p.group
    if (typeof p.min === 'number') def.min = p.min
    if (typeof p.max === 'number') def.max = p.max
    if (typeof p.step === 'number') def.step = p.step
    if (p.options?.length) def.options = p.options
    return def
  })
}

export const mergeParams = (lists: ParamDef[][], hidden: Set<string>): ParamDef[] => {
  const byName = new Map<string, ParamDef>()
  for (const list of lists) for (const p of list) if (!hidden.has(p.name) && !byName.has(p.name)) byName.set(p.name, p)
  return [...byName.values()]
}

export const sameValue = (a: DefineValue, b: DefineValue) => JSON.stringify(a) === JSON.stringify(b)

export const parseDefineInput = (raw: string): DefineValue => {
  const text = raw.trim()
  if (text === 'true') return true
  if (text === 'false') return false
  if (text !== '' && !Number.isNaN(Number(text))) return Number(text)
  if (text.startsWith('[') || text.startsWith('"')) {
    try {
      return JSON.parse(text) as DefineValue
    } catch {
      return text
    }
  }
  return text
}
