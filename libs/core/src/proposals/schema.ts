import { z } from 'zod'
import { DefineValueSchema } from '../config/schema.ts'

export const PNG_PREFIX = 'data:image/png;base64,'
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
