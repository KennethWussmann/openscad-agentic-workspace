import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  addLibrary,
  checkpoint,
  clearProposal,
  createLocalLibrary,
  createProject,
  EXPORT_FORMATS,
  type ExportFormat,
  ensureRootConfig,
  exportProject,
  isDirty,
  libraryStatus,
  listLocalLibraries,
  listProjects,
  listVersions,
  loadProjectConfig,
  loadSettings,
  OpenscadNotFoundError,
  type Paths,
  projectLayout,
  pruneVendor,
  type RenderResult,
  readProposal,
  readRender,
  removeLibrary,
  renderProject,
  renderSheet,
  renderView,
  requireProject,
  resolveOpenscad,
  restoreFiles,
  type Section,
  type Settings,
  sameValue,
  sectionView,
  syncLibraries,
  toPosix,
  VIEWS,
  type ViewName,
  vendorRoot,
} from '@scad/core'
import { formatBBox, formatDiagnostic, formatRender, table } from './format.ts'
import { api, ensureServer, findServer, openBrowser, stopServer, viewerUrl } from './server.ts'

export type Flags = {
  json?: boolean
  name?: string
  description?: string
  from?: string
  part?: string
  sheet?: boolean
  view?: string
  section?: string
  size?: string
  out?: string
  formats?: string
  message?: string
  force?: boolean
  'with-libs'?: boolean
  clear?: boolean
  git?: string
  ref?: string
  project?: string
  open?: boolean
}

export type Ctx = {
  paths: Paths
  flags: Flags
  args: string[]
}

export type Outcome = { data: unknown; text: string; exitCode?: number }

export class UsageError extends Error {}

const need = (value: string | undefined, what: string) => {
  if (!value) throw new UsageError(`Missing ${what}`)
  return value
}

const settingsFor = (paths: Paths, project?: string): Settings =>
  project ? loadProjectConfig(paths, projectLayout(paths, project).config, project).settings : loadSettings(paths)

const partsFlag = (flags: Flags) =>
  flags.part
    ?.split(',')
    .map((p) => p.trim())
    .filter(Boolean)

const rel = (paths: Paths, file: string) => toPosix(path.relative(paths.root, file))

const serverFor = async (paths: Paths) => findServer(paths, loadSettings(paths).server.port)

type Check = { name: string; ok: boolean; detail: string; fix?: string }

const gitVersion = () =>
  new Promise<string | null>((resolve) => {
    const child = spawn('git', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    let out = ''
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString()
    })
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  })

const MIN_OPENSCAD_YEAR = 2024

export const doctor = async ({ paths }: Ctx): Promise<Outcome> => {
  const checks: Check[] = []
  const nodeMajor = Number(process.versions.node.split('.')[0])
  checks.push({
    name: 'node',
    ok: nodeMajor >= 24,
    detail: process.version,
    fix: 'Install Node.js 24 or newer (https://nodejs.org, or nvm/fnm/volta).',
  })
  const viteInstalled = existsSync(path.join(paths.root, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js'))
  checks.push({
    name: 'dependencies',
    ok: viteInstalled,
    detail: viteInstalled ? 'installed' : 'missing',
    fix: 'Run `corepack enable && pnpm install` in the repository root.',
  })
  const git = await gitVersion()
  checks.push({
    name: 'git',
    ok: git !== null,
    detail: git ?? 'not found',
    fix: 'Install git; it is needed to fetch third-party OpenSCAD libraries.',
  })
  const created = ensureRootConfig(paths)
  checks.push({
    name: 'config',
    ok: true,
    detail: `${rel(paths, paths.config)}${created ? ' (created from config.example.yaml)' : ''}`,
  })
  const settings = loadSettings(paths)
  let openscad: { command: string[]; version: string; source: string } | null = null
  try {
    openscad = await resolveOpenscad(paths)
    const year = Number(openscad.version.slice(0, 4))
    const recent = Number.isFinite(year) && year >= MIN_OPENSCAD_YEAR
    checks.push({
      name: 'openscad',
      ok: recent,
      detail: `${openscad.version}  ${openscad.command.join(' ')}  (${openscad.source})`,
      fix: `OpenSCAD ${openscad.version} is too old for the Manifold backend and colored 3MF. Install a ${MIN_OPENSCAD_YEAR}+ development snapshot from https://openscad.org/downloads.html#snapshots`,
    })
  } catch (e) {
    const tried = e instanceof OpenscadNotFoundError && e.tried.length ? `\nTried: ${e.tried.join(', ')}` : ''
    checks.push({
      name: 'openscad',
      ok: false,
      detail: 'not found',
      fix: `${e instanceof Error ? e.message : String(e)}${tried}`,
    })
  }
  const server = await serverFor(paths)
  const libs = libraryStatus(paths, settings)
  const missingLibs = libs.filter((l) => !l.installed)
  checks.push({
    name: 'libraries',
    ok: true,
    detail: libs.length
      ? libs.map((l) => `${l.name}@${l.ref.slice(0, 12)}${l.installed ? '' : ' (not installed yet)'}`).join(', ')
      : 'none configured in the root config',
    ...(missingLibs.length ? { fix: 'Installed automatically on the next render, or run `pnpm scad lib sync`.' } : {}),
  })
  checks.push({ name: 'server', ok: true, detail: server ? viewerUrl(server.port) : 'not running (`pnpm scad serve`)' })
  const ok = checks.every((c) => c.ok)
  const data = { ok, checks, workspace: paths.workspace, openscad, server: server ? viewerUrl(server.port) : null }
  const text = [
    ...checks.map(
      (c) =>
        `${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(12)} ${c.detail}${!c.ok && c.fix ? `\n      -> ${c.fix.replace(/\n/g, '\n         ')}` : ''}`,
    ),
    `      ${'workspace'.padEnd(12)} ${paths.workspace}`,
    ok ? '\nReady.' : '\nFix the FAIL items above, then run `pnpm scad doctor` again.',
  ].join('\n')
  return { data, text, exitCode: ok ? 0 : 1 }
}

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

const renderViaServerOrLocal = async (paths: Paths, project: string, parts?: string[]) => {
  const server = await serverFor(paths)
  if (server && !parts) {
    const result = await api<RenderResult>(server.port, `/projects/${project}/render`, { method: 'POST', body: {} })
    return { result, server }
  }
  const openscad = await resolveOpenscad(paths)
  return { result: await renderProject({ paths, project, openscad, parts }), server }
}

const sheetFor = async (paths: Paths, project: string, result: RenderResult) => {
  const layout = projectLayout(paths, project)
  const models = result.parts.filter((p) => p.model).map((p) => path.join(layout.dir, p.model as string))
  if (!models.length) return { sheet: null, diagnostics: [] }
  const settings = settingsFor(paths, project)
  const openscad = await resolveOpenscad(paths)
  const diagnostics = await renderSheet(
    { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
    models,
    layout.sheet,
  )
  return { sheet: existsSync(layout.sheet) ? rel(paths, layout.sheet) : null, diagnostics }
}

export const render = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const { result, server } = await renderViaServerOrLocal(paths, project, partsFlag(flags))
  const wantSheet = flags.sheet ?? settingsFor(paths, project).render.sheet
  const sheet = wantSheet && result.parts.some((p) => p.model) ? await sheetFor(paths, project, result) : null
  const dirty = isDirty(paths, project)
  const latest = listVersions(paths, project).at(-1)
  const data = {
    ...result,
    sheet: sheet?.sheet ?? null,
    sheetDiagnostics: sheet?.diagnostics ?? [],
    viewer: server ? viewerUrl(server.port, project) : null,
    latestVersion: latest?.id ?? null,
    changedSinceVersion: dirty,
  }
  const lines = [formatRender(result)]
  if (sheet?.sheet) lines.push(`  sheet: ${sheet.sheet}  (2x2: iso | front / right | top)`)
  for (const d of sheet?.diagnostics ?? []) lines.push(`  sheet ${formatDiagnostic(d)}`)
  lines.push(
    `  version: ${latest ? `${latest.id}${dirty ? ' + uncheckpointed changes' : ' (unchanged)'}` : 'none yet'}`,
  )
  if (server) lines.push(`  viewer: ${viewerUrl(server.port, project)}`)
  return { data, text: lines.join('\n'), exitCode: result.status === 'ok' ? 0 : 1 }
}

const parseSection = (raw: string): Section => {
  const m = raw.match(/^([xyz])\s*=\s*(-?\d+(?:\.\d+)?)(?::(below|above))?$/i)
  if (!m) throw new UsageError('--section expects axis=value[:below|above], e.g. x=10 or z=5:above')
  return { axis: m[1].toLowerCase() as Section['axis'], at: Number(m[2]), keep: (m[3] as Section['keep']) ?? 'below' }
}

export const snapshot = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const result = readRender(paths, project)
  if (!result) throw new Error(`Render ${project} first`)
  const parts = partsFlag(flags)
  const selected = result.parts.filter((p) => p.model && (!parts || parts.includes(p.id)))
  if (!selected.length) throw new Error('No rendered parts match')
  const section = flags.section ? parseSection(flags.section) : null
  if (flags.view && !(flags.view in VIEWS))
    throw new UsageError(`--view must be one of ${Object.keys(VIEWS).join(', ')}`)
  const rotation = flags.view ? [...VIEWS[flags.view as ViewName]] : section ? sectionView(section) : [...VIEWS.iso]
  const size = Number(flags.size ?? 900)
  const name =
    flags.out ?? `snapshot-${flags.view ?? 'auto'}${section ? `-${section.axis}${section.at}-${section.keep}` : ''}.png`
  const out = path.join(layout.preview, path.basename(name))
  const settings = settingsFor(paths, project)
  const openscad = await resolveOpenscad(paths)
  const boxes = selected.map((p) => p.bbox).filter((b) => b !== null)
  const bbox = boxes.length
    ? {
        min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as [number, number, number],
        max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as [number, number, number],
        size: [0, 0, 0] as [number, number, number],
      }
    : null
  if (bbox) bbox.size = [0, 1, 2].map((i) => bbox.max[i] - bbox.min[i]) as [number, number, number]
  const diagnostics = await renderView(
    { paths, settings, openscad, cwd: layout.dir, temp: layout.temp },
    {
      models: selected.map((p) => path.join(layout.dir, p.model as string)),
      rotation: rotation as [number, number, number],
      width: size,
      height: size,
      out,
      section,
      bbox,
      axes: true,
    },
  )
  const ok = existsSync(out) && !diagnostics.some((d) => d.level === 'error')
  return {
    data: { file: rel(paths, out), ok, diagnostics },
    text: [ok ? `Wrote ${rel(paths, out)}` : 'Snapshot failed', ...diagnostics.map(formatDiagnostic)].join('\n'),
    exitCode: ok ? 0 : 1,
  }
}

export const params = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const result = readRender(paths, project) ?? (await renderViaServerOrLocal(paths, project)).result
  const rows = [['GROUP', 'NAME', 'VALUE', 'RANGE / OPTIONS', 'CAPTION']]
  for (const p of result.params)
    rows.push([
      p.group ?? '',
      p.name,
      JSON.stringify(p.initial),
      p.options
        ? p.options.map((o) => JSON.stringify(o.value)).join('|')
        : p.min !== undefined || p.max !== undefined
          ? `${p.min ?? ''}..${p.max ?? ''}${p.step ? ` step ${p.step}` : ''}`
          : '',
      p.caption ?? '',
    ])
  return { data: result.params, text: result.params.length ? table(rows) : 'No customizer parameters found.' }
}

export const exportCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const formats = flags.formats?.split(',').map((f) => f.trim()) as ExportFormat[] | undefined
  const bad = formats?.filter((f) => !EXPORT_FORMATS.includes(f))
  if (bad?.length) throw new UsageError(`Unknown format(s) ${bad.join(', ')}. Use ${EXPORT_FORMATS.join(', ')}`)
  const openscad = await resolveOpenscad(paths)
  const result = await exportProject({ paths, project, openscad, formats, parts: partsFlag(flags) })
  const failed = result.files.filter((f) => !f.ok)
  const lines = [`Exported ${project} (${result.version}) to ${rel(paths, result.outDir)}`]
  for (const f of result.files) {
    lines.push(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.part} ${f.format.padEnd(8)} ${f.file}`)
    if (!f.ok)
      for (const d of f.diagnostics.filter((d) => d.level === 'error')) lines.push(`       ${formatDiagnostic(d)}`)
  }
  if (result.version === 'wip')
    lines.push('  note: the export does not match a checkpoint; checkpoint first to tie files to a version')
  return { data: result, text: lines.join('\n'), exitCode: failed.length ? 1 : 0 }
}

export const checkpointCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const message = need(flags.message, '--message (-m)')
  const version = checkpoint({ paths, project, message, force: flags.force })
  return {
    data: version,
    text: `Checkpointed ${project} ${version.id}: ${message}\n  ${version.parts.map((p) => `${p.id} ${formatBBox(p.bbox)}`).join('\n  ')}`,
  }
}

export const versions = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const list = listVersions(paths, project)
  const rows = [['VERSION', 'CREATED', 'MESSAGE']]
  for (const v of list)
    rows.push([
      v.id,
      v.createdAt.replace('T', ' ').slice(0, 16),
      `${v.message}${v.restoredFrom ? ` (from ${v.restoredFrom})` : ''}`,
    ])
  const dirty = list.length > 0 && isDirty(paths, project)
  return {
    data: { versions: list, changedSinceLatest: dirty },
    text: list.length
      ? `${table(rows)}${dirty ? '\n(working copy has changes after the latest version)' : ''}`
      : 'No versions yet.',
  }
}

export const restore = async (ctx: Ctx): Promise<Outcome> => {
  const { paths, flags, args } = ctx
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const ref = need(args[1], 'version (e.g. v003)')
  const restored = restoreFiles(paths, project, ref, flags['with-libs'])
  const { result } = await renderViaServerOrLocal(paths, project)
  const lines = [`Restored ${restored.version.id} (${restored.version.message}) into src/`]
  if (restored.libsRestored.length) lines.push(`  restored shared libs: ${restored.libsRestored.join(', ')}`)
  if (restored.libsDiffer.length)
    lines.push(
      `  WARNING: shared libs changed since ${restored.version.id}: ${restored.libsDiffer.join(', ')}`,
      '  The model may differ from the snapshot. Re-run with --with-libs to restore them (affects other projects).',
    )
  if (result.status !== 'ok') {
    lines.push(formatRender(result), '  Not checkpointed because the render failed.')
    return { data: { restored, render: result, version: null }, text: lines.join('\n'), exitCode: 1 }
  }
  const settings = settingsFor(paths, project)
  if (settings.render.sheet) await sheetFor(paths, project, result)
  const version = checkpoint({
    paths,
    project,
    message: `Restore ${restored.version.id}: ${restored.version.message}`,
    restoredFrom: restored.version.id,
    force: true,
  })
  lines.push(`  checkpointed as ${version.id}`)
  return { data: { restored, render: result, version }, text: lines.join('\n') }
}

export const proposal = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  if (flags.clear) {
    clearProposal(paths, project)
    return { data: { cleared: true }, text: 'Proposal cleared.' }
  }
  const p = readProposal(paths, project)
  if (!p) return { data: null, text: 'No pending proposal.' }
  const current = readRender(paths, project)?.params ?? []
  const changes = Object.entries(p.params).map(([name, value]) => {
    const def = current.find((c) => c.name === name)
    return { name, from: def?.initial ?? null, to: value, unchanged: def ? sameValue(def.initial, value) : false }
  })
  const rows = [['PARAM', 'CURRENT', 'PROPOSED']]
  for (const c of changes)
    rows.push([c.name, JSON.stringify(c.from), `${JSON.stringify(c.to)}${c.unchanged ? ' (same)' : ''}`])
  return {
    data: { ...p, changes },
    text: `Proposal from the browser (${p.createdAt}, based on ${p.basedOn ?? 'no version'})${p.note ? `\nNote: ${p.note}` : ''}\n${table(rows)}\nPort the values into the .scad defaults, render, then run \`pnpm scad proposal ${project} --clear\`.`,
  }
}

export const serve = async ({ paths }: Ctx): Promise<Outcome> => {
  const settings = loadSettings(paths)
  const server = await ensureServer(paths, settings.server.port)
  const url = viewerUrl(server.port)
  return {
    data: { ...server, url, log: rel(paths, paths.serverLog) },
    text: `${server.started ? 'Started' : 'Running'} ${url}  (log: ${rel(paths, paths.serverLog)})`,
  }
}

export const open = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = args[0]
  if (project) requireProject(paths, project)
  const settings = loadSettings(paths)
  const server = await ensureServer(paths, settings.server.port)
  const url = viewerUrl(server.port, project)
  const viewers = await api<{ total: number; projects: Record<string, number> }>(server.port, '/viewers')
  let action: 'navigated' | 'opened' | 'none'
  if (viewers.total > 0 && project) {
    await api(server.port, '/navigate', { method: 'POST', body: { project } })
    action = 'navigated'
  } else if (viewers.total > 0) action = 'none'
  else if (flags.open ?? settings.server.open) {
    openBrowser(url)
    action = 'opened'
  } else action = 'none'
  const text =
    action === 'navigated'
      ? `Switched the open viewer tab to ${project}: ${url}`
      : action === 'opened'
        ? `Opened ${url} in the default browser`
        : `Viewer: ${url}`
  return { data: { url, action, viewers: viewers.total, started: server.started }, text }
}

export const stop = async ({ paths }: Ctx): Promise<Outcome> => {
  const stopped = await stopServer(paths, loadSettings(paths).server.port)
  return {
    data: { stopped: Boolean(stopped) },
    text: stopped ? `Stopped dev server on port ${stopped.port}` : 'No dev server running.',
  }
}

const libConfigFile = (paths: Paths, project?: string) => {
  if (!project) {
    ensureRootConfig(paths)
    return paths.config
  }
  return requireProject(paths, project).config
}

export const lib = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const sub = args[0] ?? 'list'
  if (sub === 'list') {
    const settings = settingsFor(paths, flags.project)
    const vendor = libraryStatus(paths, settings)
    const local = listLocalLibraries(paths)
    const rows = [['NAME', 'KIND', 'REF / SUMMARY', 'STATUS']]
    for (const l of vendor)
      rows.push([l.name, 'git', `${l.git} @ ${l.ref}`, l.installed ? `ok ${l.commit?.slice(0, 10)}` : 'missing'])
    for (const l of local) rows.push([l.name, 'local', l.summary, 'workspace/_libs'])
    return {
      data: { libraries: vendor, local },
      text: vendor.length || local.length ? table(rows) : 'No libraries configured.',
    }
  }
  if (sub === 'new') {
    const name = need(args[1], 'library name')
    const dir = createLocalLibrary(paths, name, flags.description)
    return {
      data: { name, dir: rel(paths, dir) },
      text: `Created ${rel(paths, dir)}. Use it with: use <${name}/${name}.scad>`,
    }
  }
  if (sub === 'add') {
    const name = need(args[1], 'library name (the include folder, e.g. BOSL2)')
    const git = need(flags.git, '--git <url>')
    const configFile = libConfigFile(paths, flags.project)
    const locked = await addLibrary({ paths, name, git, ref: flags.ref, configFile })
    return {
      data: { ...locked, config: rel(paths, configFile) },
      text: `Added ${name} @ ${locked.ref} (${locked.commit.slice(0, 10)}) to ${rel(paths, configFile)}`,
    }
  }
  if (sub === 'remove') {
    const name = need(args[1], 'library name')
    const configFile = libConfigFile(paths, flags.project)
    removeLibrary(configFile, name)
    return {
      data: { removed: name, config: rel(paths, configFile) },
      text: `Removed ${name} from ${rel(paths, configFile)}`,
    }
  }
  if (sub === 'sync') {
    const targets = flags.project ? [flags.project] : [undefined, ...listProjects(paths).map((p) => p.id)]
    const installed = []
    for (const t of targets) installed.push(...(await syncLibraries(paths, settingsFor(paths, t))))
    return {
      data: { installed },
      text: installed.length
        ? installed.map((l) => `Installed ${l.name} @ ${l.ref} (${l.commit.slice(0, 10)})`).join('\n')
        : 'All libraries installed.',
    }
  }
  if (sub === 'prune') {
    const keep = new Set<string>()
    for (const t of [undefined, ...listProjects(paths).map((p) => p.id)]) {
      const settings = settingsFor(paths, t)
      for (const [name, spec] of Object.entries(settings.libraries)) keep.add(vendorRoot(paths, name, spec))
    }
    const removed = pruneVendor(paths, [...keep])
    return { data: { removed }, text: removed.length ? `Removed ${removed.join(', ')}` : 'Nothing to prune.' }
  }
  throw new UsageError(`Unknown lib subcommand "${sub}"`)
}

export const status = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  const config = loadProjectConfig(paths, layout.config, project)
  const result = readRender(paths, project)
  const list = listVersions(paths, project)
  const p = readProposal(paths, project)
  const server = await serverFor(paths)
  const data = {
    project,
    name: config.meta.name,
    parts: config.meta.parts,
    render: result,
    latestVersion: list.at(-1)?.id ?? null,
    changedSinceVersion: isDirty(paths, project),
    proposal: p,
    viewer: server ? viewerUrl(server.port, project) : null,
  }
  const lines = [
    `${config.meta.name} (${project})  dir ${rel(paths, layout.dir)}`,
    result ? formatRender(result) : '  not rendered yet',
    `  versions: ${list.length}${list.length ? `, latest ${list.at(-1)?.id}` : ''}${data.changedSinceVersion ? ', working copy changed' : ''}`,
  ]
  if (p)
    lines.push(
      `  PROPOSAL pending from the browser: ${Object.keys(p.params).join(', ')} (see \`pnpm scad proposal ${project}\`)`,
    )
  if (data.viewer) lines.push(`  viewer: ${data.viewer}`)
  return { data, text: lines.join('\n') }
}
