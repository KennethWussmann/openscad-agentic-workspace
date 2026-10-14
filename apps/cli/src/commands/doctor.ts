import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  addMissingConfigSections,
  ensureRootConfig,
  gitVersion,
  libraryStatus,
  listProjects,
  loadProjectConfig,
  loadSettings,
  OpenscadNotFoundError,
  type Paths,
  printProfile,
  projectLayout,
  readRender,
  resolveOpenscad,
  type Settings,
  validateSets,
} from '@scad/core'
import { errorMessage } from '@scad/protocol'
import { type Ctx, type Outcome, rel, serverFor } from '../context.ts'
import { formatProfile } from '../format/profile.ts'
import { formatSetIssues } from '../format/sets.ts'
import { viewerUrl } from '../server.ts'

type Check = { name: string; ok: boolean; warn?: boolean; detail: string; fix?: string }

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
  const added = created ? [] : addMissingConfigSections(paths)
  checks.push({
    name: 'config',
    ok: true,
    detail: `${rel(paths, paths.config)}${created ? ' (created from config.example.yaml)' : added.length ? ` (added ${added.join(', ')} from config.example.yaml)` : ''}`,
  })
  let settings: Settings
  try {
    settings = loadSettings(paths)
  } catch (e) {
    checks.push({
      name: 'config',
      ok: false,
      detail: 'invalid',
      fix: `${errorMessage(e)}\nSee config.example.yaml for every key.`,
    })
    return doctorOutcome(paths, checks, { openscad: null, printer: null, server: null })
  }
  const printer = printProfile(settings)
  const others = Object.keys(settings.printers).filter((n) => n !== printer.printer)
  checks.push({
    name: 'printer',
    ok: true,
    detail: `${formatProfile(printer)}${others.length ? `  (also: ${others.join(', ')})` : ''}`,
  })
  const setWarnings: string[] = []
  let setCount = 0
  const invalid = listProjects(paths).flatMap((p) => {
    try {
      const { meta } = loadProjectConfig(paths, projectLayout(paths, p.id).config, p.id)
      const names = Object.keys(meta.sets)
      setCount += names.length
      const render = readRender(paths, p.id)
      if (names.length && !render) setWarnings.push(`${p.id}: not rendered yet, sets not validated`)
      if (render)
        setWarnings.push(...formatSetIssues(validateSets(meta, render.params), '').map((w) => `${p.id}: ${w}`))
      return []
    } catch (e) {
      return [errorMessage(e)]
    }
  })
  checks.push({
    name: 'projects',
    ok: invalid.length === 0,
    detail: invalid.length ? `${invalid.length} project config(s) invalid` : 'all project configs valid',
    ...(invalid.length ? { fix: invalid.join('\n') } : {}),
  })
  if (setCount)
    checks.push({
      name: 'sets',
      ok: true,
      warn: setWarnings.length > 0,
      detail: setWarnings.length
        ? `${setWarnings.length} warning(s) in ${setCount} parameter set(s), checked against the last render`
        : `${setCount} parameter set(s) match their parameters`,
      ...(setWarnings.length ? { fix: setWarnings.join('\n') } : {}),
    })
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
      fix: `${errorMessage(e)}${tried}`,
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
  return doctorOutcome(paths, checks, { openscad, printer, server: server ? viewerUrl(server.port) : null })
}

const doctorOutcome = (paths: Paths, checks: Check[], extra: Record<string, unknown>): Outcome => {
  const ok = checks.every((c) => c.ok)
  const data = { ok, checks, workspace: paths.workspace, ...extra }
  const text = [
    ...checks.map(
      (c) =>
        `${c.ok ? (c.warn ? 'WARN' : 'ok  ') : 'FAIL'}  ${c.name.padEnd(12)} ${c.detail}${(!c.ok || c.warn) && c.fix ? `\n      -> ${c.fix.replace(/\n/g, '\n         ')}` : ''}`,
    ),
    `      ${'workspace'.padEnd(12)} ${paths.workspace}`,
    ok ? '\nReady.' : '\nFix the FAIL items above, then run `pnpm scad doctor` again.',
  ].join('\n')
  return { data, text, exitCode: ok ? 0 : 1 }
}
