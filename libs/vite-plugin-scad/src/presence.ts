import { EVENTS, type PresenceEvent, type Viewers } from '@scad/protocol'
import type { ViteDevServer } from 'vite'

const PRESENCE_TTL = 20000

export const createPresence = (server: ViteDevServer) => {
  const tabs = new Map<string, { project: string | null; seen: number }>()

  server.ws.on(EVENTS.presence, (data: PresenceEvent) => {
    tabs.set(data.tab, { project: data.project, seen: Date.now() })
  })
  server.ws.on(EVENTS.leave, (data: PresenceEvent) => {
    tabs.delete(data.tab)
  })

  return (): Viewers => {
    const now = Date.now()
    const projects: Record<string, number> = {}
    let total = 0
    for (const [tab, p] of tabs) {
      if (now - p.seen > PRESENCE_TTL) {
        tabs.delete(tab)
        continue
      }
      total++
      if (p.project) projects[p.project] = (projects[p.project] ?? 0) + 1
    }
    return { total, projects }
  }
}
