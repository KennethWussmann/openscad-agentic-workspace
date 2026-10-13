import { wallLimits } from '@scad/geometry'
import type { PrintProfile } from '@scad/protocol'
import { createBoundedCache } from '../../lib/boundedCache.ts'
import type { LoadedModel } from '../model/loader.ts'
import {
  type AnalysisResult,
  concatenated,
  flatOf,
  type Heat,
  MAX_CACHE,
  paint,
  triangleAreas,
  triangleCount,
  wallColor,
} from './heat.ts'

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, (t: Float32Array) => void>()
const thicknessCache = createBoundedCache<Promise<Float32Array>>(MAX_CACHE)

export const measure = (model: LoadedModel) => {
  const hit = thicknessCache.get(model.key)
  if (hit) return hit
  if (!worker) {
    worker = new Worker(new URL('./thickness.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; thickness: Float32Array }>) => {
      waiting.get(e.data.id)?.(e.data.thickness)
      waiting.delete(e.data.id)
    }
  }
  const positions = concatenated(model)
  const id = ++nextId
  const job = new Promise<Float32Array>((resolve) => waiting.set(id, resolve))
  worker.postMessage({ id, positions }, [positions.buffer])
  return thicknessCache.set(model.key, job)
}

export const walls = (models: LoadedModel[], fields: Record<string, Float32Array>, s: PrintProfile): AnalysisResult => {
  const heat: Heat = {}
  let area = 0
  let extreme: number | null = null
  let busy = false
  const limits = wallLimits(s)
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
        if (th >= limits.warn) return
        area += a
        extreme = Math.min(extreme ?? Infinity, th)
      })
      heat[mesh.id] = paint(mesh.geometry, (t) => wallColor(field[offset + t], s))
      start += triangleCount(mesh.geometry)
    }
  }
  return { heat, summary: { mode: 'walls', busy, area, extreme } }
}
