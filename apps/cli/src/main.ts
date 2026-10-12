#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolvePaths } from '@scad/core'
import {
  type Ctx,
  checkpointCmd,
  doctor,
  exportCmd,
  type Flags,
  lib,
  list,
  newProject,
  type Outcome,
  open,
  params,
  proposal,
  render,
  restore,
  serve,
  snapshot,
  status,
  stop,
  UsageError,
  versions,
} from './commands.ts'

const HELP = `pnpm scad <command> [args] [--json]

Setup
  doctor                                  Find OpenSCAD, create config.yaml, show server and libraries
  serve                                   Start the viewer dev server in the background (or report it)
  open [project]                          Show a project in the browser (switches an open tab, else opens one)
  stop                                    Stop the background dev server

Projects
  list                                    All projects with render status, versions, pending proposals
  new <project> [--name N] [--description D] [--from <project>]
  status <project>                        Last render, diagnostics, version state, proposal
  render <project> [--part a,b] [--no-sheet]
                                          Render all parts to preview/*.3mf (through the dev server when running),
                                          then preview/sheet.png (2x2: iso | front / right | top)
  snapshot <project> [--view iso|front|back|left|right|top|bottom|iso-back] [--section x=10[:above]]
           [--part a,b] [--size 900] [--out name.png]
                                          Extra PNG view or cross-section into preview/
  params <project>                        Customizer parameters with values, ranges and options
  export <project> [--formats 3mf,stl,...] [--part a,b]
                                          Write configured formats to out/

Versions
  checkpoint <project> -m "message" [--force]
  versions <project>
  restore <project> <vN> [--with-libs]   Copy vN back into src/, render, record as a new version
  proposal <project> [--clear]           Parameter values and 3D annotations the user sent from the browser

Libraries
  lib list [--project p]
  lib new <name> [--description D]        Local library in workspace/_libs/<name>
  lib add <Name> --git <url> [--ref tag|commit] [--project p]
                                          Pinned git library (root config.yaml, or the project's with --project)
  lib remove <Name> [--project p]
  lib sync [--project p]                  Install missing libraries
  lib prune                               Delete library checkouts no config refers to
`

const COMMANDS: Record<string, (ctx: Ctx) => Promise<Outcome>> = {
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
  export: exportCmd,
  checkpoint: checkpointCmd,
  versions,
  restore,
  proposal,
  lib,
}

const main = async () => {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    allowNegative: true,
    strict: true,
    options: {
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      name: { type: 'string' },
      description: { type: 'string' },
      from: { type: 'string' },
      part: { type: 'string' },
      sheet: { type: 'boolean' },
      view: { type: 'string' },
      section: { type: 'string' },
      size: { type: 'string' },
      out: { type: 'string' },
      formats: { type: 'string' },
      message: { type: 'string', short: 'm' },
      force: { type: 'boolean' },
      'with-libs': { type: 'boolean' },
      clear: { type: 'boolean' },
      git: { type: 'string' },
      ref: { type: 'string' },
      project: { type: 'string' },
      open: { type: 'boolean' },
    },
  })
  const [command, ...args] = positionals
  if (!command || values.help) {
    process.stdout.write(HELP)
    return
  }
  const run = COMMANDS[command]
  if (!run) throw new UsageError(`Unknown command "${command}"`)
  const flags = values as Flags
  const outcome = await run({ paths: resolvePaths(), flags, args })
  process.stdout.write(`${flags.json ? JSON.stringify(outcome.data, null, 2) : outcome.text}\n`)
  process.exitCode = outcome.exitCode ?? 0
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e)
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`)
  else process.stderr.write(`${e instanceof UsageError ? `${message}\n\n${HELP}` : `Error: ${message}`}\n`)
  process.exitCode = e instanceof UsageError ? 2 : 1
})
