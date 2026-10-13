import type { Annotation, Vec3 } from '@scad/protocol'
import { fmt } from '../../lib/format.ts'

export const EDITOR_Z: [number, number] = [16777400, 16777300]

export const stemLength = (extent: number) => Math.max(extent * 0.07, 2)

export const tipOf = (point: Vec3, normal: Vec3, extent: number): Vec3 => {
  const s = stemLength(extent)
  return [point[0] + normal[0] * s, point[1] + normal[1] * s, point[2] + normal[2] * s]
}

export const noteNumber = (n: number) => String(n).padStart(2, '0')

type Describable = Pick<Annotation, 'kind' | 'edge' | 'surface'>

export const summarize = ({ kind, edge, surface }: Describable) => {
  const c = surface?.cylinder
  if (kind === 'edge' && edge)
    return `edge ${fmt(edge.length)} mm, ${fmt(edge.angle)}° ${edge.convex ? 'convex' : 'concave'}`
  const where = kind === 'vertex' ? 'corner of ' : ''
  if (c) return `${where}${c.concave ? 'hole' : 'boss'} Ø${fmt(c.radius * 2)} × ${fmt(c.length)}`
  if (surface?.type === 'planar') return `${where}flat face ${fmt(surface.area)} mm²`
  if (surface) return `${where}curved surface`
  return kind
}
