import { printProfile, requireProject } from '@scad/core'
import { type Ctx, type Outcome, settingsFor } from '../context.ts'
import { formatPrinterSpec, formatProfile, formatTolerances } from '../format/profile.ts'

export const printer = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = args[0]
  if (project) requireProject(paths, project)
  const settings = settingsFor(paths, project)
  const profile = printProfile(settings)
  const data = { project: project ?? null, profile, printers: settings.printers }
  const lines = [
    `Designing for ${formatProfile(profile)}${project ? `  (project ${project})` : '  (workspace default)'}`,
    `  tolerances: ${formatTolerances(profile)}`,
    profile.process === 'fdm'
      ? `  nozzles: ${profile.nozzles.join(', ')} mm; walls FAIL under the ${profile.nozzle} mm nozzle, WARN under ${profile.minWall} mm`
      : `  walls FAIL under ${profile.minFeature} mm, WARN under ${profile.minWall} mm; drain holes >= ${profile.drainHole} mm for hollow parts; islands need supports`,
    '  printers:',
    ...Object.entries(settings.printers).map(
      ([name, spec]) => `    ${name === profile.printer ? '*' : ' '} ${formatPrinterSpec(name, spec)}`,
    ),
  ]
  return { data, text: lines.join('\n') }
}
