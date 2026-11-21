import type { ProjectState } from '@scad/protocol'
import { Printer, X } from 'lucide-react'
import { IconButton } from '../../components/IconButton.tsx'
import { fmtVec } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'
import { assemblyResult } from '../../viewer/model/source.ts'

export const PeekCard = ({ project }: { project: ProjectState }) => {
  const peekPart = useStore((s) => s.peekPart)
  const setPeekPart = useStore((s) => s.setPeekPart)
  const openPart = useStore((s) => s.openPart)
  const selectedAssembly = useStore((s) => s.selectedAssembly)
  const versionId = useStore((s) => s.versionId)
  const edits = useStore((s) => Object.keys(s.edits).length > 0)
  if (!peekPart) return null
  const result = assemblyResult(project, versionId, edits, selectedAssembly)
  const part = result?.parts.find((p) => p.id === peekPart)
  const label = project.parts.find((p) => p.id === peekPart)?.label ?? peekPart
  return (
    <div className="peek-card">
      <header>
        <strong>{label}</strong>
        <IconButton title="Close" onClick={() => setPeekPart(null)}>
          <X size={13} />
        </IconButton>
      </header>
      <span className="mono">{part?.bbox ? fmtVec(part.bbox.size) : 'size unknown'}</span>
      {project.parts.some((p) => p.id === peekPart) && (
        <button type="button" className="link" onClick={() => openPart(peekPart)}>
          <Printer size={13} /> Open in print view
        </button>
      )}
    </div>
  )
}
