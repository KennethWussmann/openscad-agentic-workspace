import type { BBox } from './geometry.ts'
import type { DefineValue, InputFile } from './render.ts'

export type LockedLibrary = {
  name: string
  git: string
  ref: string
  commit: string
}

export type VersionPart = {
  id: string
  label?: string
  model: string | null
  bbox: BBox | null
}

export type VersionMeta = {
  id: string
  index: number
  message: string
  createdAt: string
  restoredFrom?: string
  parts: VersionPart[]
  params: Record<string, DefineValue>
  inputs: InputFile[]
  libraries: LockedLibrary[]
  sheet: string | null
}
