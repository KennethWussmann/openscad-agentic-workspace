import type { BBox } from './geometry.ts'

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
  group?: string
  min?: number
  max?: number
  step?: number
  options?: ParamOption[]
}

export type InputFile = {
  path: string
  sha: string
}

export type RenderResult = {
  project: string
  status: 'ok' | 'error'
  error?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  overrides: Record<string, DefineValue>
  parts: PartResult[]
  params: ParamDef[]
  inputs: InputFile[]
}
