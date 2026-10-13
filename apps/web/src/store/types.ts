import type { Annotation, ExportResult, Vec3 } from '@scad/protocol'

export type Axis = 'x' | 'y' | 'z' | 'free'

export type Measurement = { id: number; a: Vec3; b: Vec3 }

export type Display = {
  xray: boolean
  edges: boolean
  wireframe: boolean
  grid: boolean
  dims: boolean
  ortho: boolean
  modelColors: boolean
  overhangs: boolean
  walls: boolean
}

export type AnalysisMode = 'overhangs' | 'walls'

export type AnalysisSummary = {
  mode: AnalysisMode | 'islands'
  busy: boolean
  area: number
  extreme: number | null
}

export type SectionState = {
  enabled: boolean
  axis: Axis
  offset: number
  flip: boolean
  caps: boolean
  gizmo: 'translate' | 'rotate'
}

export type Tool = 'orbit' | 'measure' | 'annotate'

export type NoteDraft = Omit<Annotation, 'n'> & { id: number }

export type ExportNotice = { id: number; result: ExportResult | null; error: string | null }
