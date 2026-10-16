import type { Proposals } from './annotations.ts'
import type { CheckResult, CheckStatus } from './check.ts'
import type { APP_ID, ExportFormat } from './constants.ts'
import type { Vec3 } from './geometry.ts'
import type { PrintProfile } from './profile.ts'
import type { DefineValue, Diagnostic, PartDef, RenderResult } from './render.ts'
import type { ParamSets, SetIssue } from './sets.ts'
import type { VersionMeta } from './versions.ts'

export type Health = {
  app: typeof APP_ID
  root: string
  workspace: string
  pid: number
}

export type Viewers = {
  total: number
  projects: Record<string, number>
}

export type ProjectSummary = {
  id: string
  name: string
  description: string
  updated: number
  status: 'ok' | 'error' | 'unrendered'
  versions: number
  proposal: boolean
  cover: number | null
  parts: number
  size: Vec3 | null
  facets: number | null
  check: CheckStatus | null
}

export type ProjectState = {
  id: string
  name: string
  description: string
  parts: PartDef[]
  sets: ParamSets
  setIssues: SetIssue[]
  profile: PrintProfile
  render: RenderResult | null
  tweak: RenderResult | null
  rendering: boolean
  exporting: boolean
  versions: VersionMeta[]
  proposals: Proposals
}

export type ExportedFile = {
  part: string
  set: string
  format: ExportFormat
  file: string
  ok: boolean
  diagnostics: Diagnostic[]
}

export type ExportResult = {
  project: string
  version: string
  outDir: string
  exportedAt: string
  overrides: Record<string, DefineValue>
  sets: string[]
  files: ExportedFile[]
  meshCheck: CheckResult | null
}
