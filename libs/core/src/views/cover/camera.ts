import type { Vec3 } from '@scad/protocol'
import type { SceneMesh } from './mesh.ts'

export type Camera = {
  eye: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
  tx: number
  ty: number
  offsetX: number
  offsetY: number
}

export type CameraOptions = {
  azimuth: number
  elevation: number
  fov: number
  aspect: number
  margin: number
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const normalize = (a: Vec3): Vec3 => {
  const len = Math.hypot(...a) || 1
  return [a[0] / len, a[1] / len, a[2] / len]
}
export const add = (...vs: Vec3[]): Vec3 =>
  vs.reduce<Vec3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0])
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]

export const fitCamera = (scene: SceneMesh, opts: CameraOptions): Camera => {
  const { min, max } = scene.bounds
  const target: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const toEye: Vec3 = [
    Math.cos(opts.elevation) * Math.sin(opts.azimuth),
    -Math.cos(opts.elevation) * Math.cos(opts.azimuth),
    Math.sin(opts.elevation),
  ]
  const forward = scale(toEye, -1)
  const right = normalize(cross(forward, [0, 0, 1]))
  const up = cross(right, forward)
  const ty = Math.tan(opts.fov / 2)
  const tx = ty * opts.aspect
  const fill = 1 - opts.margin
  const p = scene.positions
  let distance = 0
  for (let i = 0; i < p.length; i += 3) {
    const rel: Vec3 = [p[i] - target[0], p[i + 1] - target[1], p[i + 2] - target[2]]
    const depth = dot(rel, forward)
    distance = Math.max(
      distance,
      Math.abs(dot(rel, right)) / (tx * fill) - depth,
      Math.abs(dot(rel, up)) / (ty * fill) - depth,
    )
  }
  const eye = add(target, scale(toEye, distance))
  let lowX = Infinity
  let highX = -Infinity
  let lowY = Infinity
  let highY = -Infinity
  for (let i = 0; i < p.length; i += 3) {
    const rel: Vec3 = [p[i] - eye[0], p[i + 1] - eye[1], p[i + 2] - eye[2]]
    const depth = dot(rel, forward)
    const nx = dot(rel, right) / (depth * tx)
    const ny = dot(rel, up) / (depth * ty)
    lowX = Math.min(lowX, nx)
    highX = Math.max(highX, nx)
    lowY = Math.min(lowY, ny)
    highY = Math.max(highY, ny)
  }
  return { eye, forward, right, up, tx, ty, offsetX: -(lowX + highX) / 2, offsetY: -(lowY + highY) / 2 + 0.04 }
}
