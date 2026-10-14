import type { BBox, Vec3 } from './geometry.ts'
import type { PrintProfile } from './profile.ts'

export type CheckStatus = 'pass' | 'warn' | 'fail'

export type CheckRegion = {
  area: number
  bbox: BBox
  center: Vec3
  worst: number
  triangles: number
}

export type ManifoldCheck = {
  status: CheckStatus
  openEdges: number
  nonManifoldEdges: number
  flippedEdges: number
  degenerate: number
  inverted: boolean
  samples: Vec3[]
  foldedEdges: number
  foldedLength: number
  folds: Vec3[]
}

export type BedCheck = {
  status: CheckStatus
  size: Vec3
  bed: Vec3
  fits: boolean
  fitsRotated: boolean
  minZ: number
}

export type RegionCheck = {
  status: CheckStatus
  area: number
  worst: number | null
  regions: CheckRegion[]
}

export type Body = {
  bbox: BBox
  volume: number
  triangles: number
}

export type Island = {
  center: Vec3
  bbox: BBox
  height: number
  area: number
}

export type IslandCheck = {
  status: CheckStatus
  count: number
  islands: Island[]
}

export type BodiesCheck = {
  status: CheckStatus
  bodies: number
  voids: number
  floating: Body[]
  small: Body[]
}

export type PartCheck = {
  id: string
  label?: string
  status: CheckStatus
  triangles: number
  bbox: BBox | null
  durationMs: number
  manifold: ManifoldCheck
  bed: BedCheck
  overhangs: RegionCheck | null
  islands: IslandCheck | null
  walls: RegionCheck
  bodies: BodiesCheck
}

export type CheckResult = {
  project: string
  set?: string
  status: CheckStatus
  checkedAt: string
  render: string
  profile: PrintProfile
  parts: PartCheck[]
}
