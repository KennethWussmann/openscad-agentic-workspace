import type { AnnotationSource, DefineValue, ModelSourceKind, ProjectState, RenderResult } from '@scad/protocol'

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
