import {
  type AnnotationInput,
  API,
  type ChangedEvent,
  type DefineValue,
  EVENTS,
  type NavigateEvent,
  type PresenceEvent,
  type ProjectState,
  type ProjectSummary,
  type RenderEvent,
  type RenderResult,
  type RenderStartEvent,
} from '@scad/core/protocol'

const request = async <T>(route: string, init?: { method?: string; body?: unknown }): Promise<T> => {
  const res = await fetch(`${API}${route}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `${route}: ${res.status}`)
  return data
}

export const fetchProjects = () => request<ProjectSummary[]>('/projects')

export const fetchProject = (id: string) => request<ProjectState>(`/projects/${encodeURIComponent(id)}`)

export const requestRender = (id: string) =>
  request<RenderResult>(`/projects/${encodeURIComponent(id)}/render`, { method: 'POST', body: {} })

export const requestTweak = (id: string, params: Record<string, DefineValue>) =>
  request<RenderResult>(`/projects/${encodeURIComponent(id)}/tweak`, { method: 'POST', body: { params } })

export const clearTweak = (id: string) => request(`/projects/${encodeURIComponent(id)}/tweak`, { method: 'DELETE' })

export const sendProposal = (id: string, params: Record<string, DefineValue>, note: string) =>
  request<{ file: string }>(`/projects/${encodeURIComponent(id)}/proposal`, {
    method: 'POST',
    body: { params, note: note || undefined },
  })

export const discardProposal = (id: string) =>
  request(`/projects/${encodeURIComponent(id)}/proposal`, { method: 'DELETE' })

export const sendAnnotations = (id: string, input: AnnotationInput) =>
  request<{ file: string; count: number }>(`/projects/${encodeURIComponent(id)}/annotations`, {
    method: 'POST',
    body: input,
  })

export const withdrawAnnotations = (id: string) =>
  request(`/projects/${encodeURIComponent(id)}/annotations`, { method: 'DELETE' })

export const fileUrl = (project: string, rel: string, stamp: string) =>
  `${API}/projects/${encodeURIComponent(project)}/file/${rel.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(stamp)}`

export type ServerHandlers = {
  onRenderStart: (e: RenderStartEvent) => void
  onRender: (e: RenderEvent) => void
  onChanged: (e: ChangedEvent) => void
  onNavigate: (e: NavigateEvent) => void
}

const tabId = () => {
  const existing = sessionStorage.getItem('scad-tab')
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem('scad-tab', id)
  return id
}

export const connect = (handlers: ServerHandlers, currentProject: () => string | null) => {
  const hot = import.meta.hot
  if (!hot) return () => undefined
  const tab = tabId()
  hot.on(EVENTS.renderStart, handlers.onRenderStart)
  hot.on(EVENTS.render, handlers.onRender)
  hot.on(EVENTS.changed, handlers.onChanged)
  hot.on(EVENTS.navigate, handlers.onNavigate)
  const beat = () => hot.send(EVENTS.presence, { tab, project: currentProject() } satisfies PresenceEvent)
  beat()
  const timer = setInterval(beat, 5000)
  const leave = () => hot.send(EVENTS.leave, { tab, project: null } satisfies PresenceEvent)
  window.addEventListener('beforeunload', leave)
  return () => {
    clearInterval(timer)
    window.removeEventListener('beforeunload', leave)
    hot.off(EVENTS.renderStart, handlers.onRenderStart)
    hot.off(EVENTS.render, handlers.onRender)
    hot.off(EVENTS.changed, handlers.onChanged)
    hot.off(EVENTS.navigate, handlers.onNavigate)
    leave()
  }
}

export const announce = (project: string | null) => {
  import.meta.hot?.send(EVENTS.presence, { tab: tabId(), project } satisfies PresenceEvent)
}
