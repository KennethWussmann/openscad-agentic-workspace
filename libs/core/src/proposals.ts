import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { DefineValueSchema } from './config.ts'
import { type Paths, projectLayout, toPosix } from './paths.ts'
import type { AnnotationInput, AnnotationProposal, ParamProposal, Proposals } from './protocol.ts'
import { readJson, writeJsonAtomic } from './render.ts'

const PNG_PREFIX = 'data:image/png;base64,'
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
export const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024

const finite = z.number().finite()
const Vec3Schema = z.tuple([finite, finite, finite])
const BBoxSchema = z.object({ min: Vec3Schema, max: Vec3Schema, size: Vec3Schema })

const SourceSchema = z.object({
  kind: z.enum(['working', 'tweak', 'version']),
  version: z.string().nullable(),
  render: z.string().nullable(),
  params: z.record(z.string(), DefineValueSchema).optional(),
})

const SurfaceSchema = z.object({
  type: z.enum(['planar', 'cylindrical', 'curved']),
  area: finite,
  bbox: BBoxSchema,
  triangles: z.number().int().nonnegative(),
  facet: z.object({ normal: Vec3Schema, area: finite, bbox: BBoxSchema }),
  cylinder: z
    .object({
      axis: Vec3Schema,
      center: Vec3Schema,
      radius: finite,
      length: finite,
      arc: finite,
      concave: z.boolean(),
    })
    .optional(),
})

const AnnotationSchema = z.object({
  n: z.number().int().positive(),
  text: z.string().trim().min(1, 'every note needs text').max(4000),
  kind: z.enum(['face', 'edge', 'vertex']),
  point: Vec3Schema,
  normal: Vec3Schema,
  part: z.object({ id: z.string().min(1), file: z.string().nullable(), mesh: z.number().int(), color: z.string() }),
  edge: z.object({ a: Vec3Schema, b: Vec3Schema, length: finite, angle: finite, convex: z.boolean() }).optional(),
  surface: SurfaceSchema.nullable(),
  source: SourceSchema,
})

export const AnnotationInputSchema = z.object({
  note: z.string().max(4000).optional(),
  source: SourceSchema,
  camera: z.object({
    position: Vec3Schema,
    target: Vec3Schema,
    up: Vec3Schema,
    projection: z.enum(['perspective', 'orthographic']),
  }),
  section: z.object({ axis: z.enum(['x', 'y', 'z', 'free']), normal: Vec3Schema, constant: finite }).nullable(),
  annotations: z.array(AnnotationSchema).min(1, 'no annotations').max(200),
  snapshot: z.string().startsWith(PNG_PREFIX, 'snapshot must be a PNG data URL'),
})

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
