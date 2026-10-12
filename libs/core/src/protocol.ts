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

export type ParamProposal = {
  params: Record<string, DefineValue>
  note?: string
  createdAt: string
  basedOn: string | null
}

export type AnnotationKind = 'face' | 'edge' | 'vertex'

export type SurfaceType = 'planar' | 'cylindrical' | 'curved'

export type Cylinder = {
  axis: Vec3
  center: Vec3
  radius: number
  length: number
  arc: number
  concave: boolean
}

export type Facet = {
  normal: Vec3
  area: number
  bbox: BBox
}

export type Surface = {
  type: SurfaceType
  area: number
  bbox: BBox
  triangles: number
  facet: Facet
  cylinder?: Cylinder
}

export type AnnotationEdge = {
  a: Vec3
  b: Vec3
  length: number
  angle: number
  convex: boolean
}

export type ModelSourceKind = 'working' | 'tweak' | 'version'

export type AnnotationSource = {
  kind: ModelSourceKind
  version: string | null
  render: string | null
  params?: Record<string, DefineValue>
}

export type AnnotationPart = {
  id: string
  file: string | null
  mesh: number
  color: string
}

export type Annotation = {
  n: number
  text: string
  kind: AnnotationKind
  point: Vec3
  normal: Vec3
  part: AnnotationPart
  edge?: AnnotationEdge
  surface: Surface | null
  source: AnnotationSource
}

export type ViewCamera = {
  position: Vec3
  target: Vec3
  up: Vec3
  projection: 'perspective' | 'orthographic'
}

export type ViewSection = {
  axis: 'x' | 'y' | 'z' | 'free'
  normal: Vec3
  constant: number
}

export type AnnotationInput = {
  note?: string
  source: AnnotationSource
  camera: ViewCamera
  section: ViewSection | null
  annotations: Annotation[]
  snapshot: string
}

export type AnnotationProposal = Omit<AnnotationInput, 'snapshot'> & {
  createdAt: string
  basedOn: string | null
  snapshot: string
}

export type Proposals = {
  params: ParamProposal | null
  annotations: AnnotationProposal | null
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
  proposals: Proposals
}

export type RenderStartEvent = { project: string; kind: 'preview' | 'tweak' }
export type RenderEvent = { project: string; kind: 'preview' | 'tweak'; result: RenderResult }
export type ChangedEvent = { project: string }
export type NavigateEvent = { project: string }
export type PresenceEvent = { tab: string; project: string | null }

export const isProjectId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id)
