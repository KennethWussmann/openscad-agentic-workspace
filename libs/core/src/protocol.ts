export const APP_ID = 'openscad-agentic-workspace'
export const API = '/api'
export const PROJECT_PARAM = 'project'

export const EVENTS = {
  renderStart: 'scad:render-start',
  render: 'scad:render',
  changed: 'scad:changed',
  navigate: 'scad:navigate',
  presence: 'scad:presence',
  leave: 'scad:leave',
} as const

export type Vec3 = [number, number, number]

export type DefineValue = number | string | boolean | DefineValue[]

export type Health = {
  app: typeof APP_ID
  root: string
  workspace: string
  pid: number
}

export type BBox = {
  min: Vec3
  max: Vec3
  size: Vec3
}

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

export type LockedLibrary = {
  name: string
  git: string
  ref: string
  commit: string
}

export type VersionPart = {
  id: string
  label?: string
  model: string | null
  bbox: BBox | null
}

export type VersionMeta = {
  id: string
  index: number
  message: string
  createdAt: string
  restoredFrom?: string
  parts: VersionPart[]
  params: Record<string, DefineValue>
  inputs: InputFile[]
  libraries: LockedLibrary[]
  sheet: string | null
}

export type Proposal = {
  params: Record<string, DefineValue>
  note?: string
  createdAt: string
  basedOn: string | null
}

export type ProjectSummary = {
  id: string
  name: string
  description: string
  updated: number
  status: 'ok' | 'error' | 'unrendered'
  versions: number
  proposal: boolean
}

export type ProjectState = {
  id: string
  name: string
  description: string
  parts: PartDef[]
  render: RenderResult | null
  tweak: RenderResult | null
  rendering: boolean
  versions: VersionMeta[]
  proposal: Proposal | null
}

export type RenderStartEvent = { project: string; kind: 'preview' | 'tweak' }
export type RenderEvent = { project: string; kind: 'preview' | 'tweak'; result: RenderResult }
export type ChangedEvent = { project: string }
export type NavigateEvent = { project: string }
export type PresenceEvent = { tab: string; project: string | null }

export const isProjectId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id)
