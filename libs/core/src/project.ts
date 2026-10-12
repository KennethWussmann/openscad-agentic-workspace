import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseDocument, stringify } from 'yaml'
import { loadProjectConfig, printProfile } from './config.ts'
import { type Paths, projectLayout } from './paths.ts'
import { hasProposals, readProposals } from './proposals.ts'
import { isProjectId, type ProjectState, type ProjectSummary } from './protocol.ts'
import { readRender } from './render.ts'
import { listVersions } from './versions.ts'

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

const titleCase = (id: string) =>
  id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export const mainTemplate = (name: string, description: string) => `// ${name}
// ${description || 'Describe what this model is for.'}
// Units: millimetres. Z is up, the model sits on the XY plane.

/* [Dimensions] */
// Outer width along X
width = 40; // [5:1:200]
// Outer depth along Y
depth = 30; // [5:1:200]
// Outer height along Z
height = 20; // [2:1:200]
// Radius of the vertical edges
corner_radius = 3; // [0:0.5:20]

/* [Quality] */
// Maximum angle per facet on curves, in degrees
$fa = 4; // [1:1:12]
// Maximum facet length on curves, in mm
$fs = 0.4; // [0.1:0.05:2]

/* [Hidden] */
eps = 0.01;

rounded_block([width, depth, height], corner_radius);

module rounded_block(size, r) {
  if (r <= 0) {
    cube(size);
  } else {
    hull() {
      for (x = [r, size.x - r], y = [r, size.y - r])
        translate([x, y, 0]) cylinder(r = r, h = size.z);
    }
  }
}
`

export const briefTemplate = (name: string, description: string) => `# ${name}

${description || 'One or two sentences on what this is and what it is for.'}

## Requirements

- 

## Key dimensions and constraints

- 

## Parts

- main: 

## Decisions

- 

## Changelog

`

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

export const projectState = (paths: Paths, id: string, rendering = false): ProjectState => {
  const layout = requireProject(paths, id)
  const config = loadProjectConfig(paths, layout.config, id)
  return {
    id,
    name: config.meta.name,
    description: config.meta.description,
    parts: config.meta.parts,
    profile: printProfile(config.settings),
    render: readRender(paths, id, 'preview'),
    tweak: readRender(paths, id, 'tweak'),
    rendering,
    versions: listVersions(paths, id),
    proposals: readProposals(paths, id),
  }
}
