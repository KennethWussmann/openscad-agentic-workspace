import { overhangField } from '@scad/geometry'
import type { FdmProfile } from '@scad/protocol'
import type { LoadedModel } from '../model/loader.ts'
import { type AnalysisResult, flatOf, type Heat, overhangColor, paint, triangleAreas } from './heat.ts'

export const overhangs = (models: LoadedModel[], s: FdmProfile): AnalysisResult => {
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
