import {
  addLibrary,
  createLocalLibrary,
  ensureRootConfig,
  libraryStatus,
  listLocalLibraries,
  listProjects,
  type Paths,
  pruneVendor,
  removeLibrary,
  requireProject,
  syncLibraries,
  vendorRoot,
} from '@scad/core'
import { type Ctx, need, type Outcome, rel, settingsFor, UsageError } from '../context.ts'
import { table } from '../format/common.ts'

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
