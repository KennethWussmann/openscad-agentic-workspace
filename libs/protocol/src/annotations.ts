import type { BBox, Vec3 } from './geometry.ts'
import type { DefineValue } from './render.ts'

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

export type ParamProposal = {
  params: Record<string, DefineValue>
  set?: string
  note?: string
  createdAt: string
  basedOn: string | null
}

export type Proposals = {
  params: ParamProposal | null
  annotations: AnnotationProposal | null
}
