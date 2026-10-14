import type { AnnotationInput } from './annotations.ts'
import { API } from './constants.ts'
import type { ExportResult, Health, ProjectState, ProjectSummary, Viewers } from './project.ts'
import type { DefineValue, RenderResult } from './render.ts'
import type { SaveSetInput, SetsResponse } from './sets.ts'

type Init = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export type Ok = { ok: true }
export type WrittenFile = Ok & { file: string }
export type WrittenAnnotations = WrittenFile & { count: number }

const projectRoute = (id: string) => `/projects/${encodeURIComponent(id)}`

export const fileRoute = (project: string, rel: string, stamp: string) =>
  `${API}${projectRoute(project)}/file/${rel.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(stamp)}`

export const createApiClient = (origin = '') => {
  const call = async <T>(route: string, init: Init = {}): Promise<T> => {
    const res = await fetch(`${origin}${API}${route}`, {
      method: init.method ?? 'GET',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    })
    const data = (await res.json()) as T & { error?: string }
    if (!res.ok) throw new Error(data.error ?? `${route} failed with ${res.status}`)
    return data
  }

  return {
    health: (signal?: AbortSignal) => call<Health>('/health', { signal }),
    viewers: () => call<Viewers>('/viewers'),
    navigate: (project: string) => call<Viewers>('/navigate', { method: 'POST', body: { project } }),
    projects: () => call<ProjectSummary[]>('/projects'),
    project: (id: string) => call<ProjectState>(projectRoute(id)),
    render: (id: string) => call<RenderResult>(`${projectRoute(id)}/render`, { method: 'POST', body: {} }),
    tweak: (id: string, params: Record<string, DefineValue>) =>
      call<RenderResult>(`${projectRoute(id)}/tweak`, { method: 'POST', body: { params } }),
    clearTweak: (id: string) => call<Ok>(`${projectRoute(id)}/tweak`, { method: 'DELETE' }),
    exportModels: (id: string, overrides: Record<string, DefineValue>, set: string | null = null) =>
      call<ExportResult>(`${projectRoute(id)}/export`, { method: 'POST', body: { overrides, set: set ?? undefined } }),
    saveSet: (id: string, input: SaveSetInput) =>
      call<SetsResponse>(`${projectRoute(id)}/sets`, { method: 'POST', body: input }),
    deleteSet: (id: string, name: string) =>
      call<SetsResponse>(`${projectRoute(id)}/sets/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    sendProposal: (id: string, params: Record<string, DefineValue>, note: string, set: string | null = null) =>
      call<WrittenFile>(`${projectRoute(id)}/proposal`, {
        method: 'POST',
        body: { params, note: note || undefined, set: set ?? undefined },
      }),
    discardProposal: (id: string) => call<Ok>(`${projectRoute(id)}/proposal`, { method: 'DELETE' }),
    sendAnnotations: (id: string, input: AnnotationInput) =>
      call<WrittenAnnotations>(`${projectRoute(id)}/annotations`, { method: 'POST', body: input }),
    withdrawAnnotations: (id: string) => call<Ok>(`${projectRoute(id)}/annotations`, { method: 'DELETE' }),
    fileUrl: (project: string, rel: string, stamp: string) => `${origin}${fileRoute(project, rel, stamp)}`,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
