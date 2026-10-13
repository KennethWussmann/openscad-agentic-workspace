import type { PrintProfile } from '@scad/protocol'
import type { Settings } from './schema.ts'

export const printProfile = (settings: Settings): PrintProfile => {
  const printer = settings.print.printer
  const p = settings.printers[printer]
  const base = {
    printer,
    bed: p.bed,
    layerHeight: settings.print.layerHeight ?? p.layerHeight,
    tolerances: p.tolerances,
    minRegionArea: settings.check.minRegionArea,
  }
  if (p.process === 'resin')
    return {
      process: 'resin',
      ...base,
      pixel: p.pixel,
      minWall: p.minWall,
      minFeature: p.minFeature,
      drainHole: p.drainHole,
    }
  const nozzle = settings.print.nozzle ?? p.nozzles[0]
  return {
    process: 'fdm',
    ...base,
    nozzle,
    nozzles: p.nozzles,
    overhangAngle: p.overhangAngle,
    minWall: p.minWall ?? 2 * nozzle,
  }
}
