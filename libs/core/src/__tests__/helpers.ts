import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type Paths, resolvePaths } from '../index.ts'

export const tempPaths = (name: string): Paths => {
  const base = path.resolve(import.meta.dirname, '../../.test-tmp', `${name}-${process.pid}`)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  const paths = resolvePaths({ workspace: path.join(base, 'workspace'), config: path.join(base, 'config.yaml') })
  mkdirSync(paths.workspace, { recursive: true })
  return paths
}

export const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}
