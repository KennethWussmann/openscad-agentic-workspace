import { existsSync } from 'node:fs'
import path from 'node:path'
import type { InputFile, RenderKind, RenderResult } from '@scad/protocol'
import { readJson, sha1 } from '../fs/json.ts'
import { type Paths, projectLayout, toPosix } from '../workspace/paths.ts'

export const renderDir = (paths: Paths, project: string, kind: RenderKind) => {
  const layout = projectLayout(paths, project)
  return kind === 'preview' ? layout.preview : layout.tweak
}

export const readRender = (paths: Paths, project: string, kind: RenderKind = 'preview') =>
  readJson<RenderResult>(path.join(renderDir(paths, project, kind), 'render.json'))

export const inputEntry = (paths: Paths, file: string): InputFile | null =>
  existsSync(file) ? { path: toPosix(path.relative(paths.workspace, file)), sha: sha1(file) } : null

export const inputsChanged = (paths: Paths, inputs: InputFile[]) =>
  inputs.filter((input) => {
    const file = path.join(paths.workspace, input.path)
    return !existsSync(file) || sha1(file) !== input.sha
  })

export const isRenderCurrent = (paths: Paths, render: RenderResult | null) =>
  render !== null && render.status === 'ok' && inputsChanged(paths, render.inputs).length === 0
