import type {
  AnnotationSource,
  AssemblyResult,
  DefineValue,
  ModelSourceKind,
  ProjectState,
  RenderResult,
} from '@scad/protocol'

export type ModelSource = {
  kind: ModelSourceKind
  stamp: string
  parts: { id: string; model: string | null }[]
}

export const modelSource = (project: ProjectState, versionId: string | null, tweaking: boolean): ModelSource | null => {
  if (versionId) {
    const v = project.versions.find((x) => x.id === versionId)
    return v ? { kind: 'version', stamp: v.id, parts: v.parts } : null
  }
  const pick = (kind: ModelSourceKind, r: RenderResult): ModelSource => ({
    kind,
    stamp: r.finishedAt,
    parts: r.parts.map((p) => ({ id: p.id, model: p.model })),
  })
  if (tweaking && project.tweak?.parts.some((p) => p.model)) return pick('tweak', project.tweak)
  return project.render ? pick('working', project.render) : null
}

export const assemblyResult = (
  project: ProjectState,
  versionId: string | null,
  tweaking: boolean,
  assemblyId: string | null,
): AssemblyResult | null => {
  if (!assemblyId) return null
  if (versionId) {
    const v = project.versions.find((x) => x.id === versionId)
    const a = v?.assemblies.find((x) => x.id === assemblyId)
    return a
      ? {
          id: a.id,
          label: a.label,
          file: '',
          status: 'ok',
          preview: false,
          export: false,
          stale: false,
          parts: a.parts.map((p) => ({
            ...p,
            stale: false,
            diagnostics: [],
            facets: null,
            vertices: null,
            durationMs: 0,
          })),
          bbox: null,
          durationMs: 0,
          diagnostics: [],
        }
      : null
  }
  const tweak = tweaking && project.tweak?.assemblies.some((a) => a.parts.some((p) => p.model))
  const from = tweak ? project.tweak : project.render
  return from?.assemblies.find((a) => a.id === assemblyId) ?? null
}

export const assemblySource = (
  project: ProjectState,
  versionId: string | null,
  tweaking: boolean,
  assemblyId: string | null,
): ModelSource | null => {
  const result = assemblyResult(project, versionId, tweaking, assemblyId)
  if (!result) return null
  if (versionId) return { kind: 'version', stamp: versionId, parts: result.parts }
  const tweak = tweaking && project.tweak?.assemblies.some((a) => a.parts.some((p) => p.model))
  return {
    kind: tweak ? 'tweak' : 'working',
    stamp: (tweak ? project.tweak?.finishedAt : project.render?.finishedAt) ?? '',
    parts: result.parts.map((p) => ({ id: p.id, model: p.model })),
  }
}

export const annotationSource = (
  project: ProjectState,
  versionId: string | null,
  edits: Record<string, DefineValue>,
): AnnotationSource => {
  const source = modelSource(project, versionId, Object.keys(edits).length > 0)
  if (!source) return { kind: 'working', version: null, render: null }
  if (source.kind === 'version') return { kind: 'version', version: source.stamp, render: null }
  return {
    kind: source.kind,
    version: null,
    render: source.stamp,
    ...(source.kind === 'tweak' ? { params: edits } : {}),
  }
}
