import { findRepoRoot, resolvePaths } from '@scad/core'
import type { Plugin } from 'vite'
import { createScadServer } from './server.ts'

export type ScadWorkspaceOptions = {
  root?: string
  workspace?: string
  config?: string
  debounceMs?: number
}

export const scadWorkspace = (opts: ScadWorkspaceOptions = {}): Plugin => ({
  name: 'scad-workspace',
  apply: 'serve',
  configureServer: (server) => {
    const paths = resolvePaths({
      root: opts.root ?? findRepoRoot(server.config.root),
      workspace: opts.workspace,
      config: opts.config,
    })
    createScadServer(server, paths, opts.debounceMs ?? 200)
  },
})
