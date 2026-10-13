import { errorMessage, type ProjectState } from '@scad/protocol'
import { Download } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { api } from '../../api/client.ts'
import { deliverExport, download } from '../../api/download.ts'
import { IconButton } from '../../components/IconButton.tsx'
import { useDismiss } from '../../hooks/useDismiss.ts'
import { plural } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

export const ExportButton = ({ project }: { project: ProjectState }) => {
  const exporting = useStore((s) => s.exporting)
  const versionId = useStore((s) => s.versionId)
  const edits = useStore((s) => s.edits)
  const showExportNotice = useStore((s) => s.showExportNotice)
  const [menu, setMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenu(false), [])
  useDismiss(menu, root, closeMenu)
  const tweaks = Object.keys(edits).length
  const version = versionId ? project.versions.find((v) => v.id === versionId) : null

  const run = (withTweaks: boolean) => {
    setMenu(false)
    api
      .exportModels(project.id, withTweaks ? edits : {})
      .then((result) => deliverExport(project.id, result))
      .catch((e: unknown) => showExportNotice({ result: null, error: errorMessage(e) }))
  }

  const onClick = () => {
    if (version) {
      download(
        version.parts
          .filter((p) => p.model)
          .map((p) => ({
            url: api.fileUrl(project.id, p.model as string, version.id),
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
  const blocked = exporting && !version

  return (
    <div className="export-pick" ref={root}>
      <IconButton title={title} busy={blocked} disabled={blocked} onClick={onClick}>
        <Download size={15} />
      </IconButton>
      {menu && (
        <div className="export-menu">
          <button type="button" onClick={() => run(false)}>
            <strong>Export source</strong>
            <small>The model as the code defines it, tweaks are ignored</small>
          </button>
          <button type="button" onClick={() => run(true)}>
            <strong>Export with {plural(tweaks, 'tweak')}</strong>
            <small>Written as *-tweaked.3mf, not part of any version</small>
          </button>
        </div>
      )}
    </div>
  )
}
