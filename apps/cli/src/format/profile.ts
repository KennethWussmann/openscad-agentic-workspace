import type { PrinterSpec } from '@scad/core'
import type { PrintProfile } from '@scad/protocol'
import { num } from './common.ts'

export const formatProfile = (p: PrintProfile) => {
  const common = `${p.printer} (${p.process}), bed ${p.bed.map(num).join(' x ')} mm, layer ${num(p.layerHeight)} mm`
  return p.process === 'fdm'
    ? `${common}, nozzle ${num(p.nozzle)} mm, overhang > ${num(p.overhangAngle)} deg, min wall ${num(p.minWall)} mm`
    : `${common}, pixel ${num(p.pixel)} mm, min feature ${num(p.minFeature)} mm, min wall ${num(p.minWall)} mm`
}

export const formatTolerances = (p: PrintProfile) => {
  const t = p.tolerances
  return `press ${num(t.press)}, sliding ${num(t.sliding)}, loose ${num(t.loose)} mm per side; holes +${num(t.hole)} mm on the diameter`
}

export const formatPrinterSpec = (name: string, p: PrinterSpec) =>
  `${name} (${p.process}), bed ${p.bed.map(num).join(' x ')} mm, ${p.process === 'fdm' ? `nozzles ${p.nozzles.map(num).join(', ')} mm` : `pixel ${num(p.pixel)} mm`}`
