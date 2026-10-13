import type { ExportResult } from './project.ts'
import type { RenderKind, RenderResult } from './render.ts'

export type ExportStartEvent = { project: string; tweaked: boolean }
export type ExportEvent = { project: string; result: ExportResult | null; error?: string }
export type RenderStartEvent = { project: string; kind: RenderKind }
export type RenderEvent = { project: string; kind: RenderKind; result: RenderResult }
export type ChangedEvent = { project: string }
export type NavigateEvent = { project: string }
export type PresenceEvent = { tab: string; project: string | null }
