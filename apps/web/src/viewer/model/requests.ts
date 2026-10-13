import { api } from '../../api/client.ts'
import type { ModelRequest } from './loader.ts'
import type { ModelSource } from './source.ts'

export const modelRequests = (project: string, source: ModelSource | null, prefix = ''): ModelRequest[] =>
  source
    ? source.parts
        .filter((p): p is { id: string; model: string } => Boolean(p.model))
        .map((p) => ({
          key: `${prefix}${project}/${p.model}@${source.stamp}`,
          partId: p.id,
          url: api.fileUrl(project, p.model, source.stamp),
        }))
    : []
