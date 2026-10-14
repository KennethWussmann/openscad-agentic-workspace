import type { ProjectState } from '@scad/protocol'
import type { ReactNode } from 'react'
import { fmtVec } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

const Cell = ({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) => (
  <div className={wide ? 'tb-cell wide' : 'tb-cell'}>
    <span className="tb-label">{label}</span>
    {children}
  </div>
)

export const TitleBlock = ({ project }: { project: ProjectState }) => {
  const versionId = useStore((s) => s.versionId)
  const ghostId = useStore((s) => s.ghostId)
  const edits = useStore((s) => s.edits)
  const activeSet = useStore((s) => s.activeSet)
  const bounds = useStore((s) => s.bounds)
  const solo = useStore((s) => s.solo)
  const tweaked = Object.keys(edits).length > 0 && !versionId
  const onSet = Boolean(activeSet) && !tweaked && !versionId
  const size = bounds ? bounds[1].map((v, i) => v - bounds[0][i]) : null
  const showing =
    versionId ?? (tweaked ? 'TWEAK' : onSet ? `SET ${activeSet}` : project.versions.length ? 'WIP' : 'DRAFT')
  return (
    <div className="titleblock">
      <Cell label="Project" wide>
        <strong>{project.name}</strong>
      </Cell>
      <Cell label="Showing">
        <span className={`mono ${tweaked ? 'amber' : onSet ? 'cyan' : ''}`}>{showing}</span>
      </Cell>
      <Cell label="Overlay">
        <span className="mono cyan">{ghostId ?? '-'}</span>
      </Cell>
      <Cell label="Envelope" wide>
        <span className="mono">{size ? fmtVec(size) : '-'}</span>
      </Cell>
      <Cell label="Part">
        <span className="mono">{solo ?? (project.parts.length > 1 ? 'ASSY' : project.parts[0]?.id)}</span>
      </Cell>
      <Cell label="Units">
        <span className="mono">mm</span>
      </Cell>
      <Cell label="Scale">
        <span className="mono">1:1</span>
      </Cell>
    </div>
  )
}
