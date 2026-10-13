import type { Vec3 } from '@scad/protocol'
import { BufferGeometry, Float32BufferAttribute, type Vector3 } from 'three'

export const gridSteps = (extent: number) => (extent <= 80 ? [1, 10] : extent <= 400 ? [5, 50] : [10, 100])

export type Rect = { x0: number; x1: number; y0: number; y1: number }

export const gridLines = (rect: Rect, step: number, skip: number) => {
  const pts: number[] = []
  const onSkip = (v: number) => skip > 0 && Math.abs(v / skip - Math.round(v / skip)) < 1e-6
  for (let x = Math.ceil(rect.x0 / step) * step; x <= rect.x1 + 1e-6; x += step)
    if (!onSkip(x)) pts.push(x, rect.y0, 0, x, rect.y1, 0)
  for (let y = Math.ceil(rect.y0 / step) * step; y <= rect.y1 + 1e-6; y += step)
    if (!onSkip(y)) pts.push(rect.x0, y, 0, rect.x1, y, 0)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts, 3))
  return g
}

export const fitsBed = (size: Vector3, bed: Vec3) =>
  size.z <= bed[2] + 1e-6 &&
  ((size.x <= bed[0] + 1e-6 && size.y <= bed[1] + 1e-6) || (size.y <= bed[0] + 1e-6 && size.x <= bed[1] + 1e-6))
