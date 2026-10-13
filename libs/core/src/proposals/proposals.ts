import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AnnotationInput, AnnotationProposal, ParamProposal, Proposals } from '@scad/protocol'
import { readJson, writeJsonAtomic } from '../fs/json.ts'
import { type Paths, projectLayout, toPosix } from '../workspace/paths.ts'
import { AnnotationInputSchema, MAX_SNAPSHOT_BYTES, PNG_PREFIX } from './schema.ts'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const decodeSnapshot = (dataUrl: string) => {
  const png = Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64')
  if (!png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) throw new Error('snapshot is not a PNG')
  if (png.length > MAX_SNAPSHOT_BYTES) throw new Error('snapshot is too large')
  return png
}

export const readParamProposal = (paths: Paths, id: string) =>
  readJson<ParamProposal>(projectLayout(paths, id).paramProposal)

export const writeParamProposal = (paths: Paths, id: string, proposal: ParamProposal) =>
  writeJsonAtomic(projectLayout(paths, id).paramProposal, proposal)

export const readAnnotations = (paths: Paths, id: string) =>
  readJson<AnnotationProposal>(projectLayout(paths, id).annotations)

export const writeAnnotations = (
  paths: Paths,
  id: string,
  input: unknown,
  basedOn: string | null,
): AnnotationProposal => {
  const parsed = AnnotationInputSchema.safeParse(input)
  if (!parsed.success)
    throw new Error(
      `Invalid annotations: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')}`,
    )
  const { snapshot, note, ...rest } = parsed.data as AnnotationInput
  const layout = projectLayout(paths, id)
  const png = decodeSnapshot(snapshot)
  mkdirSync(layout.proposals, { recursive: true })
  writeFileSync(layout.annotationsSnapshot, png)
  const proposal: AnnotationProposal = {
    createdAt: new Date().toISOString(),
    basedOn,
    ...(note?.trim() ? { note: note.trim() } : {}),
    snapshot: toPosix(path.relative(layout.dir, layout.annotationsSnapshot)),
    ...rest,
    annotations: rest.annotations.map((a, i) => ({ ...a, n: i + 1, text: a.text.trim() })),
  }
  writeJsonAtomic(layout.annotations, proposal)
  return proposal
}

export const readProposals = (paths: Paths, id: string): Proposals => ({
  params: readParamProposal(paths, id),
  annotations: readAnnotations(paths, id),
})

export const hasProposals = (paths: Paths, id: string) => {
  const layout = projectLayout(paths, id)
  return existsSync(layout.paramProposal) || existsSync(layout.annotations)
}

export const clearParamProposal = (paths: Paths, id: string) =>
  rmSync(projectLayout(paths, id).paramProposal, { force: true })

export const clearAnnotations = (paths: Paths, id: string) => {
  const layout = projectLayout(paths, id)
  rmSync(layout.annotations, { force: true })
  rmSync(layout.annotationsSnapshot, { force: true })
}

export const clearProposals = (paths: Paths, id: string) => {
  clearParamProposal(paths, id)
  clearAnnotations(paths, id)
}
