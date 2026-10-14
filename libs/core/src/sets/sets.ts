import { DEFAULT_SET, type DefineValue, type ParamSet, type PartDef } from '@scad/protocol'
import type { ProjectMeta, Settings } from '../config/schema.ts'

export type ActiveSet = { name: string; def: ParamSet }

export const setNames = (meta: ProjectMeta) => Object.keys(meta.sets)

export const requireSet = (meta: ProjectMeta, name: string): ActiveSet => {
  const def = meta.sets[name]
  if (!def) {
    const names = setNames(meta)
    throw new Error(`Unknown set "${name}". ${names.length ? `Sets: ${names.join(', ')}` : 'The project has no sets.'}`)
  }
  return { name, def }
}

export const resolveSet = (meta: ProjectMeta, name: string | null | undefined): ActiveSet | null =>
  name && name !== DEFAULT_SET ? requireSet(meta, name) : null

export const setAppliesTo = (set: ParamSet, partId: string) => !set.parts || set.parts.includes(partId)

export const setParts = <P extends PartDef>(parts: P[], set: ActiveSet | null) =>
  set ? parts.filter((p) => setAppliesTo(set.def, p.id)) : parts

export const effectiveDefines = (
  settings: Settings,
  set: ActiveSet | null,
  overrides: Record<string, DefineValue>,
  part: PartDef,
): Record<string, DefineValue> => ({
  ...settings.render.defines,
  ...(set && setAppliesTo(set.def, part.id) ? set.def.values : {}),
  ...overrides,
  ...part.defines,
})

export const exportSetNames = (meta: ProjectMeta) =>
  Object.entries(meta.sets)
    .filter(([, set]) => set.export)
    .map(([name]) => name)
