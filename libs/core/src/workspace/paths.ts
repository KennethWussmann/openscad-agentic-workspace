import { existsSync } from 'node:fs'
import path from 'node:path'

export const findRepoRoot = (from: string = process.cwd()) => {
  let dir = path.resolve(from)
  while (!existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`Not inside the workspace repository: ${from}`)
    dir = parent
  }
  return dir
}

export type Paths = {
  root: string
  workspace: string
  config: string
  configExample: string
  libs: string
  vendor: string
  serverState: string
  serverLog: string
}

export const resolvePaths = (opts: { root?: string; workspace?: string; config?: string } = {}): Paths => {
  const root = opts.root ?? findRepoRoot(import.meta.dirname)
  const workspace = path.resolve(opts.workspace ?? process.env.SCAD_WORKSPACE ?? path.join(root, 'workspace'))
  return {
    root,
    workspace,
    config: path.resolve(opts.config ?? process.env.SCAD_CONFIG ?? path.join(root, 'config.yaml')),
    configExample: path.join(root, 'config.example.yaml'),
    libs: path.join(workspace, '_libs'),
    vendor: path.join(workspace, '_vendor'),
    serverState: path.join(workspace, '.server.json'),
    serverLog: path.join(workspace, '.server.log'),
  }
}

export const projectLayout = (paths: Paths, id: string) => {
  const dir = path.join(paths.workspace, id)
  return {
    dir,
    config: path.join(dir, 'config.yaml'),
    brief: path.join(dir, 'brief.md'),
    src: path.join(dir, 'src'),
    preview: path.join(dir, 'preview'),
    renderFile: path.join(dir, 'preview', 'render.json'),
    sheet: path.join(dir, 'preview', 'sheet.png'),
    cover: path.join(dir, 'preview', 'cover.png'),
    out: path.join(dir, 'out'),
    versions: path.join(dir, 'versions'),
    proposals: path.join(dir, 'proposals'),
    paramProposal: path.join(dir, 'proposals', 'params.json'),
    annotations: path.join(dir, 'proposals', 'annotations.json'),
    annotationsSnapshot: path.join(dir, 'proposals', 'annotations.png'),
    temp: path.join(dir, 'temp'),
    tweak: path.join(dir, 'temp', 'tweak'),
  }
}

export type ProjectLayout = ReturnType<typeof projectLayout>

export const toPosix = (p: string) => p.split(path.sep).join('/')

export const isInside = (parent: string, child: string) => {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
