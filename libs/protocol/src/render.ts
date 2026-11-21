import type { BBox } from './geometry.ts'
import type { Unit } from './units.ts'

export type DefineValue = number | string | boolean | DefineValue[]

export type RenderKind = 'preview' | 'tweak'

export type DiagnosticLevel = 'error' | 'warning' | 'deprecated' | 'trace' | 'echo'

export type Diagnostic = {
  level: DiagnosticLevel
  message: string
  file?: string
  line?: number
}

export type PartDef = {
  id: string
  label?: string
  file: string
  defines: Record<string, DefineValue>
  preview: boolean
  params?: string[]
}

export type AssemblyDef = {
  id: string
  label?: string
  file: string
  defines: Record<string, DefineValue>
  preview: boolean
  export: boolean
}

export type PartResult = {
  id: string
  label?: string
  file: string
  status: 'ok' | 'error'
  model: string | null
  stale: boolean
  bbox: BBox | null
  facets: number | null
  vertices: number | null
  durationMs: number
  diagnostics: Diagnostic[]
}

export type ParamOption = {
  name: string
  value: DefineValue
}

export type ParamDef = {
  name: string
  type: 'number' | 'string' | 'boolean' | 'vector'
  initial: DefineValue
  caption?: string
  unit?: Unit
  group?: string
  min?: number
  max?: number
  step?: number
  options?: ParamOption[]
}

export type AssemblyPart = {
  id: string
  label?: string
  model: string | null
  stale: boolean
  bbox: BBox | null
  facets: number | null
  vertices: number | null
  durationMs: number
  diagnostics: Diagnostic[]
}

export type AssemblyResult = {
  id: string
  label?: string
  file: string
  status: 'ok' | 'error'
  preview: boolean
  export: boolean
  stale: boolean
  parts: AssemblyPart[]
  bbox: BBox | null
  durationMs: number
  diagnostics: Diagnostic[]
}

export type InputFile = {
  path: string
  sha: string
}

export type RenderResult = {
  project: string
  set?: string
  status: 'ok' | 'error'
  error?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  overrides: Record<string, DefineValue>
  parts: PartResult[]
  assemblies: AssemblyResult[]
  params: ParamDef[]
  inputs: InputFile[]
}
