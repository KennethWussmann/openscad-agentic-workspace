import type { ExportResult, ProjectState } from '@scad/core/protocol'
import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { download, fileUrl, requestExport } from '../api.ts'
import { useStore } from '../store.ts'

const baseName = (file: string) => file.split('/').at(-1) ?? file

const deliver = (project: string, result: ExportResult) =>
  download(
    result.files
      .filter((f) => f.ok)
      .map((f) => ({ url: fileUrl(project, f.file, result.exportedAt), name: baseName(f.file) })),
  )

export const ExportButton = ({ project }: { project: ProjectState }) => {
  const exporting = useStore((s) => s.exporting)
  const versionId = useStore((s) => s.versionId)
  const edits = useStore((s) => s.edits)
  const showExportNotice = useStore((s) => s.showExportNotice)
  const [menu, setMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const tweaks = Object.keys(edits).length
  const version = versionId ? project.versions.find((v) => v.id === versionId) : null

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menu])

  const run = (withTweaks: boolean) => {
    setMenu(false)
    requestExport(project.id, withTweaks ? edits : {})
      .then((result) => deliver(project.id, result))
      .catch((e: unknown) => showExportNotice({ result: null, error: e instanceof Error ? e.message : String(e) }))
  }

  const onClick = () => {
    if (version) {
      download(
        version.parts
          .filter((p) => p.model)
          .map((p) => ({
            url: fileUrl(project.id, p.model as string, version.id),
            name: `${project.id}-${p.id}-${version.id}.3mf`,
          })),
      )
      return
    }
    if (tweaks) setMenu(!menu)
    else run(false)
  }

  const title = version
    ? `Download the stored ${version.id} preview 3MF`
    : exporting
      ? 'Export running'
      : tweaks
        ? 'Export 3MF (source or with tweaks)'
        : 'Export 3MF'

  return (
    <div className="export-pick" ref={root}>
      <button
        type="button"
        className={`icon-btn${exporting && !version ? ' is-busy' : ''}`}
        title={title}
        disabled={exporting && !version}
        onClick={onClick}
      >
        <Download size={15} />
      </button>
      {menu && (
        <div className="export-menu">
          <button type="button" onClick={() => run(false)}>
            <strong>Export source</strong>
            <small>The model as the code defines it, tweaks are ignored</small>
          </button>
          <button type="button" onClick={() => run(true)}>
            <strong>
              Export with {tweaks} tweak{tweaks === 1 ? '' : 's'}
            </strong>
            <small>Written as *-tweaked.3mf, not part of any version</small>
          </button>
        </div>
      )}
    </div>
  )
}
