import type { Vec3 } from './geometry.ts'

export type Tolerances = {
  press: number
  sliding: number
  loose: number
  hole: number
}

type ProfileBase = {
  printer: string
  bed: Vec3
  layerHeight: number
  minWall: number
  tolerances: Tolerances
  minRegionArea: number
}

export type FdmProfile = ProfileBase & {
  process: 'fdm'
  nozzle: number
  nozzles: number[]
  overhangAngle: number
}

export type ResinProfile = ProfileBase & {
  process: 'resin'
  pixel: number
  minFeature: number
  drainHole: number
}

export type PrintProfile = FdmProfile | ResinProfile
