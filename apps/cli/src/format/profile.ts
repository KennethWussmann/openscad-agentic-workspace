import type { PrinterSpec } from '@scad/core'
import type { PrintProfile } from '@scad/protocol'
import { num } from './common.ts'

export const fine = (n: number) => n.toFixed(3).replace(/\.?0+$/, '')

export const formatProfile = (p: PrintProfile) => {
  const common = `${p.printer} (${p.process}), bed ${p.bed.map(num).join(' x ')} mm, layer ${fine(p.layerHeight)} mm`
  return p.process === 'fdm'
    ? `${common}, nozzle ${num(p.nozzle)} mm, overhang > ${num(p.overhangAngle)} deg, min wall ${num(p.minWall)} mm`
    : `${common}, pixel ${fine(p.pixel)} mm, min feature ${num(p.minFeature)} mm, min wall ${num(p.minWall)} mm`
}

export const formatTolerances = (p: PrintProfile) => {
  const t = p.tolerances
  return `press ${fine(t.press)}, sliding ${fine(t.sliding)}, loose ${fine(t.loose)} mm per side; holes +${fine(t.hole)} mm on the diameter`
}

export const formatPrinterSpec = (name: string, p: PrinterSpec) =>
  `${name} (${p.process}), bed ${p.bed.map(num).join(' x ')} mm, ${p.process === 'fdm' ? `nozzles ${p.nozzles.map(num).join(', ')} mm` : `pixel ${fine(p.pixel)} mm`}`
