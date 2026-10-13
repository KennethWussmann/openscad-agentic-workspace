import { BED_FACE, wallLimits } from '@scad/geometry'
import type { PrintProfile } from '@scad/protocol'
import { type BufferGeometry, Color, Float32BufferAttribute } from 'three'
import type { AnalysisSummary } from '../../store/store.ts'
import type { LoadedModel } from '../model/loader.ts'

export const HEAT = {
  neutral: new Color('#7d8b97'),
  bed: new Color('#2b6e7c'),
  amber: new Color('#f2a541'),
  red: new Color('#ff3b30'),
}

export type Heat = Record<string, BufferGeometry>

const flatGeometries = new WeakMap<BufferGeometry, BufferGeometry>()

export const flatOf = (geometry: BufferGeometry) => {
  let flat = flatGeometries.get(geometry)
  if (!flat) {
    flat = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    flat.computeVertexNormals()
    flatGeometries.set(geometry, flat)
  }
  return flat
}

export const triangleCount = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3

export const triangleAreas = (flat: BufferGeometry) => {
  const p = flat.getAttribute('position').array
  const out = new Float32Array(p.length / 9)
  for (let t = 0; t < out.length; t++) {
    const o = 9 * t
    const ux = p[o + 3] - p[o]
    const uy = p[o + 4] - p[o + 1]
    const uz = p[o + 5] - p[o + 2]
    const vx = p[o + 6] - p[o]
    const vy = p[o + 7] - p[o + 1]
    const vz = p[o + 8] - p[o + 2]
    out[t] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  return out
}

export const paint = (geometry: BufferGeometry, color: (t: number) => Color) => {
  const flat = flatOf(geometry).clone()
  const count = flat.getAttribute('position').count / 3
  const colors = new Float32Array(count * 9)
  for (let t = 0; t < count; t++) {
    const c = color(t)
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], 9 * t + 3 * k)
  }
  flat.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return flat
}

const scratch = new Color()
const ramp = (from: Color, to: Color, f: number) => scratch.copy(from).lerp(to, Math.max(0, Math.min(1, f)))

export const overhangColor = (angle: number, threshold: number) => {
  if (angle === BED_FACE) return HEAT.bed
  if (angle <= threshold) return HEAT.neutral
  return ramp(HEAT.amber, HEAT.red, (angle - threshold) / Math.max(1, 90 - threshold))
}

export const wallColor = (thickness: number, s: PrintProfile) => {
  const { fail, warn } = wallLimits(s)
  if (thickness <= fail) return HEAT.red
  if (thickness <= warn) return ramp(HEAT.red, HEAT.amber, (thickness - fail) / (warn - fail || 1))
  if (thickness <= 2 * warn) return ramp(HEAT.amber, HEAT.neutral, (thickness - warn) / warn)
  return HEAT.neutral
}

export type AnalysisResult = { heat: Heat; summary: AnalysisSummary }

export const MAX_CACHE = 16

export const concatenated = (model: LoadedModel) => {
  const flats = model.meshes.map((m) => flatOf(m.geometry).getAttribute('position').array)
  const positions = new Float32Array(flats.reduce((n, a) => n + a.length, 0))
  let offset = 0
  for (const a of flats) {
    positions.set(a, offset)
    offset += a.length
  }
  return positions
}
