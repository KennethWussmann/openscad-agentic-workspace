import { BED_FACE, overhangField } from '@scad/core/check'
import type { CheckSettings } from '@scad/core/protocol'
import { useEffect, useMemo, useState } from 'react'
import { type BufferGeometry, Color, Float32BufferAttribute } from 'three'
import type { AnalysisMode, AnalysisSummary } from '../store.ts'
import type { LoadedModel } from './models.ts'

export const HEAT = {
  neutral: new Color('#7d8b97'),
  bed: new Color('#2b6e7c'),
  amber: new Color('#f2a541'),
  red: new Color('#ff3b30'),
}

export type Heat = Record<string, BufferGeometry>

const flatGeometries = new WeakMap<BufferGeometry, BufferGeometry>()

const flatOf = (geometry: BufferGeometry) => {
  let flat = flatGeometries.get(geometry)
  if (!flat) {
    flat = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    flat.computeVertexNormals()
    flatGeometries.set(geometry, flat)
  }
  return flat
}

const triangleCount = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3

const triangleAreas = (flat: BufferGeometry) => {
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

const paint = (geometry: BufferGeometry, color: (t: number) => Color) => {
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

export const wallColor = (thickness: number, s: CheckSettings) => {
  if (thickness <= s.nozzle) return HEAT.red
  if (thickness <= s.minWall) return ramp(HEAT.red, HEAT.amber, (thickness - s.nozzle) / (s.minWall - s.nozzle || 1))
  if (thickness <= 2 * s.minWall) return ramp(HEAT.amber, HEAT.neutral, (thickness - s.minWall) / s.minWall)
  return HEAT.neutral
}

type Result = { heat: Heat; summary: AnalysisSummary }

const overhangs = (models: LoadedModel[], s: CheckSettings): Result => {
  const heat: Heat = {}
  let area = 0
  let extreme: number | null = null
  for (const model of models) {
    const bedZ = model.box.min.z
    for (const mesh of model.meshes) {
      const flat = flatOf(mesh.geometry)
      const angles = overhangField(flat.getAttribute('position').array, null, bedZ)
      const areas = triangleAreas(flat)
      angles.forEach((a, t) => {
        if (a <= s.overhangAngle) return
        area += areas[t]
        extreme = Math.max(extreme ?? 0, a)
      })
      heat[mesh.id] = paint(mesh.geometry, (t) => overhangColor(angles[t], s.overhangAngle))
    }
  }
  return { heat, summary: { mode: 'overhangs', busy: false, area, extreme } }
}

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, (t: Float32Array) => void>()
const thicknessCache = new Map<string, Promise<Float32Array>>()
const MAX_CACHE = 16

const measure = (model: LoadedModel) => {
  const hit = thicknessCache.get(model.key)
  if (hit) return hit
  if (!worker) {
    worker = new Worker(new URL('./thickness.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; thickness: Float32Array }>) => {
      waiting.get(e.data.id)?.(e.data.thickness)
      waiting.delete(e.data.id)
    }
  }
  const flats = model.meshes.map((m) => flatOf(m.geometry).getAttribute('position').array)
  const positions = new Float32Array(flats.reduce((n, a) => n + a.length, 0))
  let offset = 0
  for (const a of flats) {
    positions.set(a, offset)
    offset += a.length
  }
  const id = ++nextId
  const job = new Promise<Float32Array>((resolve) => waiting.set(id, resolve))
  worker.postMessage({ id, positions }, [positions.buffer])
  thicknessCache.set(model.key, job)
  if (thicknessCache.size > MAX_CACHE) {
    const oldest = thicknessCache.keys().next().value
    if (oldest) thicknessCache.delete(oldest)
  }
  return job
}

const walls = (models: LoadedModel[], fields: Record<string, Float32Array>, s: CheckSettings): Result => {
  const heat: Heat = {}
  let area = 0
  let extreme: number | null = null
  let busy = false
  for (const model of models) {
    const field = fields[model.key]
    if (!field) {
      busy = true
      continue
    }
    let start = 0
    for (const mesh of model.meshes) {
      const flat = flatOf(mesh.geometry)
      const areas = triangleAreas(flat)
      const offset = start
      areas.forEach((a, t) => {
        const th = field[offset + t]
        if (th >= s.minWall) return
        area += a
        extreme = Math.min(extreme ?? Infinity, th)
      })
      heat[mesh.id] = paint(mesh.geometry, (t) => wallColor(field[offset + t], s))
      start += triangleCount(mesh.geometry)
    }
  }
  return { heat, summary: { mode: 'walls', busy, area, extreme } }
}

export const useAnalysis = (
  models: Record<string, LoadedModel>,
  visible: string[],
  settings: CheckSettings,
  mode: AnalysisMode | null,
): Result | null => {
  const shown = useMemo(
    () => visible.map((id) => models[id]).filter((m): m is LoadedModel => Boolean(m)),
    [models, visible],
  )
  const [fields, setFields] = useState<Record<string, Float32Array>>({})
  useEffect(() => {
    if (mode !== 'walls') return
    let alive = true
    for (const model of shown)
      measure(model).then((field) => {
        if (alive) setFields((f) => (f[model.key] === field ? f : { ...f, [model.key]: field }))
      })
    return () => {
      alive = false
    }
  }, [mode, shown])
  const result = useMemo(() => {
    if (mode === 'overhangs') return overhangs(shown, settings)
    if (mode === 'walls') return walls(shown, fields, settings)
    return null
  }, [mode, shown, fields, settings])
  useEffect(() => {
    if (!result) return
    return () => {
      for (const g of Object.values(result.heat)) g.dispose()
    }
  }, [result])
  return result
}
