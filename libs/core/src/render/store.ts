import { existsSync } from 'node:fs'
import path from 'node:path'
import type { AssemblyResult, InputFile, RenderKind, RenderResult } from '@scad/protocol'
import { readJson, sha1 } from '../fs/json.ts'
import { type Paths, projectLayout, toPosix } from '../workspace/paths.ts'

export const renderDir = (paths: Paths, project: string, kind: RenderKind, set?: string | null) => {
  const layout = projectLayout(paths, project)
  if (kind === 'tweak') return layout.tweak
  return set ? path.join(layout.preview, 'sets', set) : layout.preview
}

export const readRender = (paths: Paths, project: string, kind: RenderKind = 'preview', set?: string | null) =>
  readJson<RenderResult>(path.join(renderDir(paths, project, kind, set), 'render.json'))

export const inputEntry = (paths: Paths, file: string): InputFile | null =>
  existsSync(file) ? { path: toPosix(path.relative(paths.workspace, file)), sha: sha1(file) } : null

export const previewAssembly = (render: RenderResult | null): AssemblyResult | null =>
  render?.assemblies.find((a) => a.preview && a.status === 'ok') ?? null

export const renderModels = (paths: Paths, project: string, render: RenderResult | null): string[] => {
  const layout = projectLayout(paths, project)
  const assembly = previewAssembly(render)
  const entries = assembly ? assembly.parts.map((p) => p.model) : render?.parts.map((p) => p.model)
  return (entries ?? [])
    .filter((m): m is string => m !== null)
    .map((m) => path.join(layout.dir, m))
    .filter((m) => existsSync(m))
}

export const inputsChanged = (paths: Paths, inputs: InputFile[]) =>
  inputs.filter((input) => {
    const file = path.join(paths.workspace, input.path)
    return !existsSync(file) || sha1(file) !== input.sha
  })

export const isRenderCurrent = (paths: Paths, render: RenderResult | null) =>
  render !== null && render.status === 'ok' && inputsChanged(paths, render.inputs).length === 0
