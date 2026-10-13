import { BED_FACE, buildTopology, findIslands, overhangField } from '@scad/geometry'
import { createBoundedCache } from '../../lib/boundedCache.ts'
import type { LoadedModel } from '../model/loader.ts'
import { type AnalysisResult, concatenated, flatOf, HEAT, type Heat, MAX_CACHE, paint, triangleCount } from './heat.ts'

type IslandMask = { mask: Uint8Array; count: number }

const islandCache = createBoundedCache<IslandMask>(MAX_CACHE)

const islandMask = (model: LoadedModel): IslandMask => {
  const hit = islandCache.get(model.key)
  if (hit) return hit
  const positions = concatenated(model)
  const mask = new Uint8Array(positions.length / 9)
  const found = findIslands(buildTopology(positions, null), model.box.min.z)
  for (const island of found) for (const t of island.triangles) mask[t] = 1
  const result = { mask, count: found.length }
  return islandCache.set(model.key, result)
}

export const islands = (models: LoadedModel[]): AnalysisResult => {
  const heat: Heat = {}
  let count = 0
  for (const model of models) {
    const { mask, count: found } = islandMask(model)
    count += found
    const bedZ = model.box.min.z
    let start = 0
    for (const mesh of model.meshes) {
      const offset = start
      const angles = overhangField(flatOf(mesh.geometry).getAttribute('position').array, null, bedZ)
      heat[mesh.id] = paint(mesh.geometry, (t) =>
        mask[offset + t] ? HEAT.red : angles[t] === BED_FACE ? HEAT.bed : HEAT.neutral,
      )
      start += triangleCount(mesh.geometry)
    }
  }
  return { heat, summary: { mode: 'islands', busy: false, area: 0, extreme: count || null } }
}
