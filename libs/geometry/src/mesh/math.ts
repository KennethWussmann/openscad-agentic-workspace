import type { BBox, Vec3 } from '@scad/protocol'

export const round = (n: number, digits = 4) => {
  const f = 10 ** digits
  const r = Math.round(n * f) / f
  return Object.is(r, -0) ? 0 : r
}

export const roundVec = (v: ArrayLike<number>, digits = 4): Vec3 => [
  round(v[0], digits),
  round(v[1], digits),
  round(v[2], digits),
]

export const boxOf = (min: ArrayLike<number>, max: ArrayLike<number>, digits = 4): BBox => ({
  min: roundVec(min, digits),
  max: roundVec(max, digits),
  size: roundVec([max[0] - min[0], max[1] - min[1], max[2] - min[2]], digits),
})

export const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180)

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const unit = (a: Vec3): Vec3 => {
  const l = len(a)
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const unionBoxes = (boxes: BBox[]): BBox | null => {
  if (!boxes.length) return null
  const min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as Vec3
  const max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as Vec3
  return { min, max, size: [0, 1, 2].map((i) => max[i] - min[i]) as Vec3 }
}
