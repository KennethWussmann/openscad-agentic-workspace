import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isProjectId, type ProjectState, type ProjectSummary } from '@scad/protocol'
import { parseDocument, stringify } from 'yaml'
import { loadProjectConfig } from '../config/load.ts'
import { printProfile } from '../config/profile.ts'
import { hasProposals, readProposals } from '../proposals/proposals.ts'
import { readRender } from '../render/store.ts'
import { validateSets } from '../sets/validate.ts'
import { listVersions } from '../versions/versions.ts'
import { type Paths, projectLayout } from '../workspace/paths.ts'
import { briefTemplate, mainTemplate, titleCase } from './templates.ts'

export const assertProjectId = (id: string) => {
  if (!isProjectId(id)) throw new Error(`Invalid project id "${id}": use lowercase letters, digits and dashes`)
}

export const projectExists = (paths: Paths, id: string) =>
  isProjectId(id) && existsSync(projectLayout(paths, id).config)

export const requireProject = (paths: Paths, id: string) => {
  assertProjectId(id)
  if (!projectExists(paths, id))
    throw new Error(`Project "${id}" does not exist. Create it with \`pnpm scad new ${id}\`.`)
  return projectLayout(paths, id)
}

export type CreateProjectOptions = {
  paths: Paths
  id: string
  name?: string
  description?: string
  from?: string
}

export const createProject = ({ paths, id, name, description = '', from }: CreateProjectOptions) => {
  assertProjectId(id)
  const layout = projectLayout(paths, id)
  if (existsSync(layout.dir)) throw new Error(`Project "${id}" already exists`)
  const title = name ?? titleCase(id)
  if (from) {
    const source = requireProject(paths, from)
    mkdirSync(layout.dir, { recursive: true })
    cpSync(source.src, layout.src, { recursive: true })
    cpSync(source.config, layout.config)
    if (existsSync(source.brief)) cpSync(source.brief, layout.brief)
    const doc = parseDocument(readFileSync(layout.config, 'utf8'))
    doc.set('name', title)
    if (description) doc.set('description', description)
    writeFileSync(layout.config, doc.toString())
  } else {
    mkdirSync(layout.src, { recursive: true })
    writeFileSync(
      layout.config,
      stringify({ name: title, description, parts: [{ id: 'main', file: 'src/main.scad' }] }),
    )
    writeFileSync(path.join(layout.src, 'main.scad'), mainTemplate(title, description))
    writeFileSync(layout.brief, briefTemplate(title, description))
  }
  for (const dir of [layout.preview, layout.out, layout.versions, layout.temp]) mkdirSync(dir, { recursive: true })
  return layout
}

export const listProjects = (paths: Paths): ProjectSummary[] => {
  if (!existsSync(paths.workspace)) return []
  return readdirSync(paths.workspace)
    .filter((id) => projectExists(paths, id))
    .map((id): ProjectSummary => {
      const layout = projectLayout(paths, id)
      let name = id
      let description = ''
      try {
        const config = loadProjectConfig(paths, layout.config, id)
        name = config.meta.name
        description = config.meta.description
      } catch {
        name = id
      }
      const render = readRender(paths, id)
      const updated = Math.max(
        statSync(layout.config).mtimeMs,
        existsSync(layout.renderFile) ? statSync(layout.renderFile).mtimeMs : 0,
      )
      return {
        id,
        name,
        description,
        updated,
        status: render ? render.status : 'unrendered',
        versions: listVersions(paths, id).length,
        proposal: hasProposals(paths, id),
      }
    })
    .sort((a, b) => b.updated - a.updated)
}

export const projectState = (paths: Paths, id: string, rendering = false, exporting = false): ProjectState => {
  const layout = requireProject(paths, id)
  const config = loadProjectConfig(paths, layout.config, id)
  const render = readRender(paths, id, 'preview')
  return {
    id,
    name: config.meta.name,
    description: config.meta.description,
    parts: config.meta.parts,
    sets: config.meta.sets,
    setIssues: render ? validateSets(config.meta, render.params) : [],
    profile: printProfile(config.settings),
    render,
    tweak: readRender(paths, id, 'tweak'),
    rendering,
    exporting,
    versions: listVersions(paths, id),
    proposals: readProposals(paths, id),
  }
}
