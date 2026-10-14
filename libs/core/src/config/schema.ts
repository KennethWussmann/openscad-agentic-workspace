import { type DefineValue, EXPORT_FORMATS, RESERVED_SET_NAMES, SET_NAME, type Tolerances } from '@scad/protocol'
import { z } from 'zod'

export const DefineValueSchema: z.ZodType<DefineValue> = z.lazy(() =>
  z.union([z.number(), z.string(), z.boolean(), z.array(DefineValueSchema)]),
)

const Defines = z.record(
  z.string().regex(/^\$?[A-Za-z_][A-Za-z0-9_]*$/, 'invalid OpenSCAD variable name'),
  DefineValueSchema,
)

export const OpenscadCommand = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])

const LibrarySchema = z.strictObject({
  git: z.string().min(1),
  ref: z.string().min(1),
})

export type LibrarySpec = z.infer<typeof LibrarySchema>

export const LIBRARY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const Positive = z.number().positive()

export const DEFAULT_PRINTER = 'default'
export const PRINTER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const PRINTER_NAME_MESSAGE = 'printer names use letters, digits, . _ -'

export const FDM_TOLERANCES: Tolerances = { press: 0.2, sliding: 0.3, loose: 0.45, hole: 0.2 }
export const RESIN_TOLERANCES: Tolerances = { press: 0.05, sliding: 0.1, loose: 0.2, hole: 0.1 }

const TolerancesSchema = (d: Tolerances) =>
  z
    .strictObject({
      press: z.number().min(0).default(d.press),
      sliding: z.number().min(0).default(d.sliding),
      loose: z.number().min(0).default(d.loose),
      hole: z.number().min(0).default(d.hole),
    })
    .prefault({})

const BuildVolume = z.tuple([Positive, Positive, Positive])

const FdmPrinterSchema = z.strictObject({
  process: z.literal('fdm'),
  bed: BuildVolume,
  nozzles: z.array(Positive).min(1).default([0.4]),
  layerHeight: Positive.default(0.2),
  overhangAngle: z.number().min(0).max(90).default(45),
  minWall: Positive.nullable().default(null),
  tolerances: TolerancesSchema(FDM_TOLERANCES),
})

const ResinPrinterSchema = z.strictObject({
  process: z.literal('resin'),
  bed: BuildVolume,
  pixel: Positive,
  layerHeight: Positive.default(0.05),
  minWall: Positive.default(0.8),
  minFeature: Positive.default(0.3),
  drainHole: Positive.default(2.5),
  tolerances: TolerancesSchema(RESIN_TOLERANCES),
})

const PrinterSchema = z.discriminatedUnion('process', [FdmPrinterSchema, ResinPrinterSchema])

export type PrinterSpec = z.infer<typeof PrinterSchema>

export const SettingsSchema = z
  .strictObject({
    libraries: z
      .record(z.string().regex(LIBRARY_NAME, 'library names are folder names (letters, digits, . _ -)'), LibrarySchema)
      .default({}),
    openscad: z
      .strictObject({
        path: OpenscadCommand.nullable().default(null),
        backend: z.enum(['manifold', 'cgal']).default('manifold'),
        timeoutSeconds: z.number().positive().default(600),
        enable: z.array(z.string()).default([]),
      })
      .prefault({}),
    render: z
      .strictObject({
        defines: Defines.default({}),
        sheet: z.boolean().default(true),
        sheetSize: z.number().int().min(256).max(4096).default(1200),
        colorscheme: z.string().default('Tomorrow Night'),
      })
      .prefault({}),
    export: z
      .strictObject({
        formats: z.array(z.enum(EXPORT_FORMATS)).min(1).default(['3mf', 'stl']),
        filename: z.string().min(1).default('{project}-{part}'),
      })
      .prefault({}),
    server: z
      .strictObject({
        port: z.number().int().min(1024).max(65535).default(5180),
        open: z.boolean().default(true),
      })
      .prefault({}),
    print: z
      .strictObject({
        printer: z.string().regex(PRINTER_NAME, PRINTER_NAME_MESSAGE).default(DEFAULT_PRINTER),
        nozzle: Positive.nullable().default(null),
        layerHeight: Positive.nullable().default(null),
      })
      .prefault({}),
    printers: z
      .record(z.string().regex(PRINTER_NAME, PRINTER_NAME_MESSAGE), PrinterSchema)
      .prefault({ [DEFAULT_PRINTER]: { process: 'fdm', bed: [256, 256, 256] } }),
    check: z
      .strictObject({
        minRegionArea: z.number().min(0).default(1),
      })
      .prefault({}),
  })
  .superRefine((s, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
    const name = s.print.printer
    const printer = s.printers[name]
    if (!printer) {
      issue(
        ['print', 'printer'],
        `"${name}" is not defined in printers (${Object.keys(s.printers).join(', ') || 'none'})`,
      )
      return
    }
    if (printer.process === 'fdm') {
      const nozzle = s.print.nozzle ?? printer.nozzles[0]
      if (s.print.nozzle !== null && !printer.nozzles.some((n) => Math.abs(n - nozzle) < 1e-9))
        issue(
          ['print', 'nozzle'],
          `${nozzle} mm is not one of printers.${name}.nozzles (${printer.nozzles.join(', ')})`,
        )
      if (printer.minWall !== null && printer.minWall < nozzle)
        issue(['printers', name, 'minWall'], `must be at least the nozzle (${nozzle} mm)`)
    } else {
      if (s.print.nozzle !== null)
        issue(['print', 'nozzle'], `only applies to fdm printers, "${name}" is ${printer.process}; set it to null`)
      if (printer.minFeature < printer.pixel)
        issue(['printers', name, 'minFeature'], `must be at least one pixel (${printer.pixel} mm)`)
      if (printer.minWall < printer.minFeature)
        issue(['printers', name, 'minWall'], `must be at least minFeature (${printer.minFeature} mm)`)
    }
  })

export type Settings = z.infer<typeof SettingsSchema>

const PartId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'part ids are lowercase-dashed')

const PartSchema = z.strictObject({
  id: PartId,
  label: z.string().optional(),
  file: z.string().default('src/main.scad'),
  defines: Defines.default({}),
  preview: z.boolean().default(true),
})

const SetSchema = z.strictObject({
  label: z.string().min(1).optional(),
  values: Defines.default({}),
  export: z.boolean().default(false),
  parts: z.array(PartId).min(1).optional(),
})

export const ProjectMetaSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().default(''),
    parts: z
      .array(PartSchema)
      .min(1)
      .default([{ id: 'main', file: 'src/main.scad', defines: {}, preview: true }])
      .refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, 'part ids must be unique'),
    sets: z.record(z.string(), SetSchema).default({}),
  })
  .superRefine((meta, ctx) => {
    const ids = new Set(meta.parts.map((p) => p.id))
    for (const [name, set] of Object.entries(meta.sets)) {
      if (!SET_NAME.test(name))
        ctx.addIssue({ code: 'custom', path: ['sets', name], message: 'set names are lowercase-dashed' })
      if (RESERVED_SET_NAMES.includes(name))
        ctx.addIssue({
          code: 'custom',
          path: ['sets', name],
          message: `${RESERVED_SET_NAMES.map((n) => `"${n}"`).join(' and ')} are reserved set names`,
        })
      for (const [i, part] of (set.parts ?? []).entries())
        if (!ids.has(part))
          ctx.addIssue({
            code: 'custom',
            path: ['sets', name, 'parts', i],
            message: `"${part}" is not a part id (${[...ids].join(', ')})`,
          })
    }
  })

export type ProjectMeta = z.infer<typeof ProjectMetaSchema>

export type ProjectConfig = { meta: ProjectMeta; settings: Settings }
