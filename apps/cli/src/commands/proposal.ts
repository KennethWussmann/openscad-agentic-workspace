import path from 'node:path'
import { clearProposals, readProposals, readRender, requireProject, sameValue } from '@scad/core'
import { type Ctx, need, type Outcome, rel } from '../context.ts'
import { formatAnnotations } from '../format/annotations.ts'
import { table } from '../format/common.ts'

export const proposal = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = need(args[0], 'project id')
  const layout = requireProject(paths, project)
  if (flags.clear) {
    clearProposals(paths, project)
    return { data: { cleared: true }, text: 'Proposals cleared.' }
  }
  const pending = readProposals(paths, project)
  if (!pending.params && !pending.annotations)
    return { data: { params: null, annotations: null }, text: 'No pending proposal.' }
  const blocks: string[] = []
  let params = null
  if (pending.params) {
    const p = pending.params
    const current = readRender(paths, project)?.params ?? []
    const changes = Object.entries(p.params).map(([name, value]) => {
      const def = current.find((c) => c.name === name)
      return { name, from: def?.initial ?? null, to: value, unchanged: def ? sameValue(def.initial, value) : false }
    })
    const rows = [['PARAM', 'CURRENT', 'PROPOSED']]
    for (const c of changes)
      rows.push([c.name, JSON.stringify(c.from), `${JSON.stringify(c.to)}${c.unchanged ? ' (same)' : ''}`])
    params = { ...p, changes }
    blocks.push(
      `Parameters from the browser (${p.createdAt}, based on ${p.basedOn ?? 'no version'})${p.note ? `\nNote: ${p.note}` : ''}\n${table(rows)}\nPort the values into the .scad defaults.`,
    )
  }
  let annotations = null
  if (pending.annotations) {
    const snapshot = rel(paths, path.join(layout.dir, pending.annotations.snapshot))
    annotations = { ...pending.annotations, snapshot }
    blocks.push(
      `${formatAnnotations(pending.annotations, snapshot)}\nRead the snapshot, find the geometry at each point in src/, confirm it with a section snapshot through the point, then apply the notes.`,
    )
  }
  blocks.push(`Render, check, checkpoint, then run \`pnpm scad proposal ${project} --clear\`.`)
  return { data: { params, annotations }, text: blocks.join('\n\n') }
}
