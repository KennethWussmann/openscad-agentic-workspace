import type { ProjectState } from '@scad/protocol'
import { Ghost } from 'lucide-react'
import { sameJson } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

const when = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const Timeline = ({ project }: { project: ProjectState }) => {
  const versionId = useStore((s) => s.versionId)
  const ghostId = useStore((s) => s.ghostId)
  const setVersion = useStore((s) => s.setVersion)
  const setGhost = useStore((s) => s.setGhost)
  const latest = project.versions.at(-1)
  const workingMatches = latest && project.render && sameJson(project.render.inputs, latest.inputs)
  return (
    <div className="timeline">
      <div className="timeline-label">
        <span>Versions</span>
        <small className="mono">[ ]</small>
      </div>
      <ol className="timeline-track">
        {project.versions.map((v) => (
          <li
            key={v.id}
            className={`tick${versionId === v.id ? ' is-current' : ''}${ghostId === v.id ? ' is-ghost' : ''}${v.restoredFrom ? ' is-restore' : ''}`}
          >
            <button type="button" className="tick-main" onClick={() => setVersion(v.id)} title={v.message}>
              <span className="tick-dot" />
              <span className="tick-id mono">{v.id}</span>
              <span className="tick-msg">{v.message}</span>
              <span className="tick-date mono">{when(v.createdAt)}</span>
            </button>
            <button
              type="button"
              className="tick-ghost"
              title={ghostId === v.id ? 'Hide overlay' : `Overlay ${v.id} as ghost`}
              onClick={() => setGhost(ghostId === v.id ? null : v.id)}
              disabled={versionId === v.id}
            >
              <Ghost size={12} />
            </button>
          </li>
        ))}
        <li className={`tick working${versionId === null ? ' is-current' : ''}`}>
          <button type="button" className="tick-main" onClick={() => setVersion(null)}>
            <span className="tick-dot" />
            <span className="tick-id mono">{workingMatches ? `= ${latest?.id}` : 'WIP'}</span>
            <span className="tick-msg">{workingMatches ? 'Working copy, unchanged' : 'Working copy'}</span>
            <span className="tick-date mono">{project.render ? when(project.render.finishedAt) : 'not rendered'}</span>
          </button>
        </li>
      </ol>
    </div>
  )
}
