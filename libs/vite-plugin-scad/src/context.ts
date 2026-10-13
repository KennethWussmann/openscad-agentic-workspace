import type { Paths } from '@scad/core'
import type { DefineValue, RenderKind, RenderResult, Viewers } from '@scad/protocol'
import type { Coordinator } from './coordinator.ts'

export type ServerContext = {
  paths: Paths
  coordinator: Coordinator
  tweaks: Map<string, Record<string, DefineValue>>
  exporting: Set<string>
  send: <T>(event: string, data: T) => void
  request: (project: string, kind: RenderKind) => Promise<RenderResult>
  changed: (project: string) => void
  viewers: () => Viewers
}
