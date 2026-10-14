import path from 'node:path'
import {
  checkState,
  createProject,
  isDirty,
  listProjects,
  listVersions,
  loadProjectConfig,
  printProfile,
  readProposals,
  readRender,
  requireProject,
} from '@scad/core'
import { type Ctx, need, type Outcome, rel, serverFor } from '../context.ts'
import { table } from '../format/common.ts'
import { formatProfile } from '../format/profile.ts'
import { formatRender } from '../format/render.ts'
import { viewerUrl } from '../server.ts'

export const newProject = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const id = need(args[0], 'project id')
  const layout = createProject({ paths, id, name: flags.name, description: flags.description, from: flags.from })
  const data = { project: id, dir: rel(paths, layout.dir), main: rel(paths, path.join(layout.src, 'main.scad')) }
  return {
    data,
    text: `Created ${data.dir}${flags.from ? ` from ${flags.from}` : ''}\nEdit ${rel(paths, layout.src)}/, ${rel(paths, layout.brief)} and ${rel(paths, layout.config)}`,
  }
}

export const list = async ({ paths }: Ctx): Promise<Outcome> => {
  const projects = listProjects(paths)
  const rows = [['PROJECT', 'NAME', 'STATUS', 'VERSIONS', 'PROPOSAL']]
  for (const p of projects) rows.push([p.id, p.name, p.status, String(p.versions), p.proposal ? 'pending' : ''])
  return {
    data: projects,
    text: projects.length ? table(rows) : 'No projects yet. Create one with `pnpm scad new <id>`.',
  }
}

export const status = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const config = loadProjectConfig(paths, layout.config, project)
  const result = readRender(paths, project)
  const list = listVersions(paths, project)
  const proposals = readProposals(paths, project)
  const server = await serverFor(paths)
  const printCheck = checkState(paths, project)
  const data = {
    project,
    name: config.meta.name,
    parts: config.meta.parts,
    sets: config.meta.sets,
    render: result,
    latestVersion: list.at(-1)?.id ?? null,
    changedSinceVersion: isDirty(paths, project),
    proposals,
    check: printCheck,
    viewer: server ? viewerUrl(server.port, project) : null,
  }
  const lines = [
    `${config.meta.name} (${project})  dir ${rel(paths, layout.dir)}`,
    result ? formatRender(result) : '  not rendered yet',
    `  versions: ${list.length}${list.length ? `, latest ${list.at(-1)?.id}` : ''}${data.changedSinceVersion ? ', working copy changed' : ''}`,
    `  printer: ${formatProfile(printProfile(config.settings))}`,
    `  check: ${printCheck.status === 'missing' ? 'not run yet' : printCheck.status === 'stale' ? `outdated (was ${printCheck.result?.status})` : printCheck.status}${printCheck.status === 'pass' ? '' : ` (\`pnpm scad check ${project}\`)`}`,
  ]
  const setNames = Object.keys(config.meta.sets)
  if (setNames.length)
    lines.push(
      `  sets: ${setNames.map((n) => `${n}${config.meta.sets[n].export ? ' (export)' : ''}`).join(', ')}  (\`pnpm scad sets ${project}\`)`,
    )
  if (proposals.params)
    lines.push(
      `  PROPOSAL pending from the browser: ${Object.keys(proposals.params.params).join(', ')} (see \`pnpm scad proposal ${project}\`)`,
    )
  if (proposals.annotations)
    lines.push(
      `  ANNOTATIONS pending from the browser: ${proposals.annotations.annotations.length} note(s) on the model (see \`pnpm scad proposal ${project}\`)`,
    )
  if (data.viewer) lines.push(`  viewer: ${data.viewer}`)
  return { data, text: lines.join('\n') }
}
