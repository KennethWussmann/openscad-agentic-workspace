import {
  type ChangedEvent,
  EVENTS,
  type ExportEvent,
  type ExportStartEvent,
  type NavigateEvent,
  type PresenceEvent,
  type RenderEvent,
  type RenderStartEvent,
} from '@scad/protocol'

type HotHandler = Parameters<NonNullable<ImportMeta['hot']>['on']>[1]

export type ServerHandlers = {
  onRenderStart: (e: RenderStartEvent) => void
  onRender: (e: RenderEvent) => void
  onChanged: (e: ChangedEvent) => void
  onNavigate: (e: NavigateEvent) => void
  onExportStart: (e: ExportStartEvent) => void
  onExport: (e: ExportEvent) => void
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
  const bindings: [string, HotHandler][] = [
    [EVENTS.renderStart, handlers.onRenderStart],
    [EVENTS.render, handlers.onRender],
    [EVENTS.changed, handlers.onChanged],
    [EVENTS.navigate, handlers.onNavigate],
    [EVENTS.exportStart, handlers.onExportStart],
    [EVENTS.export, handlers.onExport],
  ]
  for (const [event, handler] of bindings) hot.on(event, handler)
  const beat = () => hot.send(EVENTS.presence, { tab, project: currentProject() } satisfies PresenceEvent)
  beat()
  const timer = setInterval(beat, 5000)
  const leave = () => hot.send(EVENTS.leave, { tab, project: null } satisfies PresenceEvent)
  window.addEventListener('beforeunload', leave)
  return () => {
    clearInterval(timer)
    window.removeEventListener('beforeunload', leave)
    for (const [event, handler] of bindings) hot.off(event, handler)
    leave()
  }
}

export const announce = (project: string | null) => {
  import.meta.hot?.send(EVENTS.presence, { tab: tabId(), project } satisfies PresenceEvent)
}
