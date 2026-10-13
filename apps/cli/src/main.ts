#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { resolvePaths } from '@scad/core'
import { errorMessage } from '@scad/protocol'
import { COMMANDS } from './commands/index.ts'
import { type Flags, UsageError } from './context.ts'
import { HELP } from './help.ts'

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
      all: { type: 'boolean' },
      'accept-fail': { type: 'boolean' },
      focus: { type: 'string' },
      define: { type: 'string', short: 'D', multiple: true },
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
  const message = errorMessage(e)
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`)
  else process.stderr.write(`${e instanceof UsageError ? `${message}\n\n${HELP}` : `Error: ${message}`}\n`)
  process.exitCode = e instanceof UsageError ? 2 : 1
})
