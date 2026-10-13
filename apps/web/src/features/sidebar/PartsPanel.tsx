import type { PartDef, ProjectState } from '@scad/protocol'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { cx } from '../../components/classes.ts'
import { IconButton } from '../../components/IconButton.tsx'
import { Panel } from '../../components/Panel.tsx'
import { fmtVec } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

const PartRow = ({ project, part }: { project: ProjectState; part: PartDef }) => {
  const hidden = useStore((s) => s.hidden)
  const solo = useStore((s) => s.solo)
  const togglePart = useStore((s) => s.togglePart)
  const setSolo = useStore((s) => s.setSolo)
  const versionId = useStore((s) => s.versionId)
  const version = project.versions.find((v) => v.id === versionId)
  const result = version ? null : project.render?.parts.find((p) => p.id === part.id)
  const bbox = version ? version.parts.find((p) => p.id === part.id)?.bbox : result?.bbox
  const visible = solo ? solo === part.id : !hidden.includes(part.id)
  return (
    <li className={cx('part', !visible && 'is-hidden', solo === part.id && 'is-solo')}>
      <IconButton title="Toggle visibility" onClick={() => togglePart(part.id)}>
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </IconButton>
      <button
        type="button"
        className="part-name"
        onClick={() => setSolo(solo === part.id ? null : part.id)}
        title="Solo this part"
      >
        <span>{part.label ?? part.id}</span>
        <small className="mono">{part.file}</small>
      </button>
      <span className="part-meta mono">
        {result?.status === 'error' && <AlertTriangle size={13} className="warn" />}
        {bbox ? fmtVec(bbox.size) : '-'}
      </span>
    </li>
  )
}

export const PartsPanel = ({ project }: { project: ProjectState }) => {
  const solo = useStore((s) => s.solo)
  const setSolo = useStore((s) => s.setSolo)
  return (
    <Panel
      title="Parts"
      count={project.parts.length}
      extra={
        solo && (
          <button type="button" className="link" onClick={() => setSolo(null)}>
            show all
          </button>
        )
      }
    >
      <ul className="parts">
        {project.parts
          .filter((p) => p.preview)
          .map((part) => (
            <PartRow key={part.id} project={project} part={part} />
          ))}
      </ul>
    </Panel>
  )
}
