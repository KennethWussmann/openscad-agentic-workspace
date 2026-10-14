import {
  type NativeSync,
  type Paths,
  readProjectParams,
  readRender,
  removeSet,
  renameParam,
  requireProject,
  resolveOpenscad,
  sameValue,
  saveSet,
  syncNativeSets,
  unsetParams,
  validateSets,
} from '@scad/core'
import type { DefineValue, ParamDef } from '@scad/protocol'
import { type Ctx, need, type Outcome, parseDefines, rel, UsageError } from '../context.ts'
import { table } from '../format/common.ts'
import { formatSetIssues, formatValues } from '../format/sets.ts'

const SUBCOMMANDS = ['save', 'rm', 'sync', 'unset', 'rename-param'] as const

const paramsOf = async (paths: Paths, project: string) => {
  const openscad = await resolveOpenscad(paths)
  return readProjectParams(paths, project, openscad)
}

const changesOf = (values: Record<string, DefineValue>, params: ParamDef[]) =>
  Object.entries(values).map(([param, value]) => {
    const def = params.find((p) => p.name === param)
    return { param, default: def?.initial ?? null, value, same: def ? sameValue(def.initial, value) : false }
  })

const nativeLines = (native: NativeSync[]) =>
  native.map(
    (n) =>
      `  native: ${n.file} (${n.sets.length ? n.sets.join(', ') : 'no sets'})${n.removed.length ? `, removed ${n.removed.join(', ')}` : ''}`,
  )

const afterEdit = async (paths: Paths, project: string, lines: string[], native: NativeSync[]) => {
  const { config, params } = await paramsOf(paths, project)
  const issues = validateSets(config.meta, params)
  return { issues, lines: [...lines, ...nativeLines(native), ...formatSetIssues(issues)] }
}

export const sets = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  requireProject(paths, project)
  const { config, params } = await paramsOf(paths, project)
  const issues = validateSets(config.meta, params)
  const list = Object.entries(config.meta.sets).map(([name, set]) => ({
    name,
    ...set,
    changes: changesOf(set.values, params),
  }))
  if (!list.length)
    return {
      data: { project, sets: [], issues },
      text: `${project} has no parameter sets. Save one with \`pnpm scad set save ${project} <name> -D name=value ...\`.`,
    }
  const blocks = list.map((s) => {
    const head = `${s.name}${s.label ? `  "${s.label}"` : ''}${s.export ? '  export' : ''}${s.parts ? `  parts ${s.parts.join(', ')}` : ''}`
    const rows = [['PARAM', 'DEFAULT', 'SET']]
    for (const c of s.changes)
      rows.push([
        c.param,
        c.default === null ? '-' : JSON.stringify(c.default),
        `${JSON.stringify(c.value)}${c.same ? ' (same)' : ''}`,
      ])
    return `${head}\n${table(rows)
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}`
  })
  return {
    data: { project, sets: list, issues },
    text: [`Parameter sets of ${project} (${list.length})`, ...blocks, ...formatSetIssues(issues, '')].join('\n\n'),
  }
}

const saveCmd = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[1], 'project id')
  const layout = requireProject(paths, project)
  const name = need(args[2], 'set name')
  const defines = parseDefines(flags.define)
  const metaOnly = !Object.keys(defines).length && (flags.label !== undefined || flags.export !== undefined)
  const fromTweak = !Object.keys(defines).length && !metaOnly
  const values = fromTweak ? (readRender(paths, project, 'tweak')?.overrides ?? {}) : defines
  if (fromTweak && !Object.keys(values).length)
    throw new UsageError('Give values with -D name=value, or tweak them in the viewer first')
  const source = fromTweak ? "the viewer's current tweak" : metaOnly ? '--label/--export' : '-D values'
  const { params } = await paramsOf(paths, project)
  const saved = saveSet({
    paths,
    project,
    name,
    values,
    label: flags.label,
    export: flags.export,
    replace: flags.replace,
    params,
  })
  const { issues, lines } = await afterEdit(
    paths,
    project,
    [
      `${saved.created ? 'Created' : 'Updated'} set ${name} in ${rel(paths, layout.config)} from ${source}`,
      `  values: ${formatValues(saved.values)}`,
      `  next: pnpm scad render ${project} --set ${name}, then pnpm scad check ${project} --set ${name}`,
    ],
    saved.native,
  )
  return {
    data: { project, set: name, created: saved.created, values: saved.values, native: saved.native, issues },
    text: lines.join('\n'),
  }
}

const rmCmd = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[1], 'project id')
  const layout = requireProject(paths, project)
  const name = need(args[2], 'set name')
  const { native } = removeSet(paths, project, name)
  return {
    data: { project, removed: name, native },
    text: [`Removed set ${name} from ${rel(paths, layout.config)}`, ...nativeLines(native)].join('\n'),
  }
}

const syncCmd = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[1], 'project id')
  requireProject(paths, project)
  const native = syncNativeSets(paths, project)
  return {
    data: { project, native },
    text: [
      `Wrote OpenSCAD parameter set files for ${project} (config.yaml stays the source of truth)`,
      ...nativeLines(native),
      `  OpenSCAD: openscad -p <file>.json -P <set> <file>.scad, or the Customizer dropdown in the GUI`,
    ].join('\n'),
  }
}

const unsetCmd = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[1], 'project id')
  requireProject(paths, project)
  const name = need(args[2], 'set name or all')
  const params = args.slice(3)
  if (!params.length) throw new UsageError('Missing parameter name(s) to unset')
  const result = unsetParams(paths, project, name, params)
  const { issues, lines } = await afterEdit(
    paths,
    project,
    [`Unset ${params.join(', ')} in ${result.changed.join(', ')}`],
    result.native,
  )
  return {
    data: { project, unset: params, sets: result.changed, native: result.native, issues },
    text: lines.join('\n'),
  }
}

const renameParamCmd = async ({ paths, args }: Ctx): Promise<Outcome> => {
  const project = need(args[1], 'project id')
  requireProject(paths, project)
  const from = need(args[2], 'old parameter name')
  const to = need(args[3], 'new parameter name')
  const result = renameParam(paths, project, from, to)
  const { issues, lines } = await afterEdit(
    paths,
    project,
    [`Renamed ${from} to ${to} in ${result.changed.join(', ')}`],
    result.native,
  )
  return { data: { project, from, to, sets: result.changed, native: result.native, issues }, text: lines.join('\n') }
}

const HANDLERS: Record<(typeof SUBCOMMANDS)[number], (ctx: Ctx) => Promise<Outcome>> = {
  save: saveCmd,
  rm: rmCmd,
  sync: syncCmd,
  unset: unsetCmd,
  'rename-param': renameParamCmd,
}

export const set = async (ctx: Ctx): Promise<Outcome> => {
  const sub = ctx.args[0]
  if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub))
    throw new UsageError(
      `Unknown set subcommand "${sub ?? ''}". Use ${SUBCOMMANDS.join(', ')}; list sets with \`pnpm scad sets <project>\``,
    )
  return HANDLERS[sub as (typeof SUBCOMMANDS)[number]](ctx)
}
