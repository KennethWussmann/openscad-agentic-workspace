import type { Ctx, Outcome } from '../context.ts'
import { check } from './check.ts'
import { doctor } from './doctor.ts'
import { exportCmd } from './export.ts'
import { lib } from './lib.ts'
import { printer } from './printer.ts'
import { list, newProject, status } from './projects.ts'
import { proposal } from './proposal.ts'
import { release } from './release.ts'
import { params, render } from './render.ts'
import { open, serve, stop } from './server.ts'
import { snapshot } from './snapshot.ts'
import { checkpointCmd, restore, versions } from './versions.ts'

export const COMMANDS: Record<string, (ctx: Ctx) => Promise<Outcome>> = {
  doctor,
  serve,
  open,
  stop,
  list,
  new: newProject,
  status,
  render,
  snapshot,
  params,
  printer,
  check,
  export: exportCmd,
  checkpoint: checkpointCmd,
  release,
  versions,
  restore,
  proposal,
  lib,
}
