import type { ExportResult } from '@scad/protocol'
import { baseName } from '../lib/format.ts'
import { api } from './client.ts'

export type Download = { url: string; name: string }

export const download = async (files: Download[]) => {
  for (const [i, file] of files.entries()) {
    if (i) await new Promise((resolve) => setTimeout(resolve, 400))
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.name
    document.body.append(a)
    a.click()
    a.remove()
  }
}

export const deliverExport = (project: string, result: ExportResult) =>
  download(
    result.files
      .filter((f) => f.ok)
      .map((f) => ({ url: api.fileUrl(project, f.file, result.exportedAt), name: baseName(f.file) })),
  )
