import { roundVec } from '@scad/geometry'
import type { Vec3 } from '@scad/protocol'
import type { Vector3 } from 'three'

export const toVec3 = (v: Vector3): Vec3 => roundVec(v.toArray())

export const extentOf = (bounds: [Vec3, Vec3] | null) =>
  bounds ? Math.max(...bounds[1].map((v, i) => v - bounds[0][i]), 10) : 100
