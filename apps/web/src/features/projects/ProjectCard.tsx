import type { ProjectSummary } from '@scad/protocol'
import { ArrowUpRight, Box } from 'lucide-react'
import { type CSSProperties, useState } from 'react'
import { api } from '../../api/client.ts'
import { Badge } from '../../components/Badge.tsx'
import { CheckTag } from '../../components/CheckTag.tsx'
import { cx } from '../../components/classes.ts'
import { ago } from '../../lib/projects.ts'

const Placeholder = ({ status }: { status: ProjectSummary['status'] }) => (
  <div className={cx('card-empty', status === 'error' && 'is-error')}>
    <Box size={34} strokeWidth={1.2} />
    <span className="mono">
      {status === 'error' ? 'render failed' : status === 'ok' ? 'drawing preview' : 'not rendered'}
    </span>
  </div>
)

const Stat = ({ label, children, wide }: { label: string; children: string; wide?: boolean }) => (
  <div className={cx('card-stat', wide && 'is-wide')}>
    <dt className="mono">{label}</dt>
    <dd className="mono">{children}</dd>
  </div>
)

type Props = {
  project: ProjectSummary
  index: number
  onOpen: (id: string) => void
}

export const ProjectCard = ({ project, index, onOpen }: Props) => {
  const [loaded, setLoaded] = useState(false)
  const src = project.cover === null ? null : api.fileUrl(project.id, 'preview/cover.png', String(project.cover))
  return (
    <button
      type="button"
      className={cx('card', project.status === 'error' && 'is-error')}
      style={{ '--i': Math.min(index, 14) } as CSSProperties}
      onClick={() => onOpen(project.id)}
    >
      <span className="card-stage">
        {src ? (
          <img
            className={cx('card-cover', loaded && 'is-loaded')}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <Placeholder status={project.status} />
        )}
        <span className="card-flags">
          {project.status === 'error' && <span className="check-tag is-fail">RENDER FAILED</span>}
          {project.check && <CheckTag status={project.check} />}
          {project.proposal && <Badge tone="amber">PROPOSAL</Badge>}
        </span>
        <span className="card-id mono">{project.id}</span>
        <span className="card-open mono">
          open <ArrowUpRight size={12} />
        </span>
      </span>
      <span className="card-body">
        <strong className="card-title">{project.name}</strong>
        <span className="card-desc">{project.description || 'No description yet.'}</span>
        <dl className="card-stats">
          <Stat label="Size mm" wide>
            {project.size ? project.size.map((v) => Math.round(v * 10) / 10).join(' x ') : '-'}
          </Stat>
          <Stat label="Parts">{String(project.parts)}</Stat>
          <Stat label="Versions">{String(project.versions)}</Stat>
          <Stat label="Edited">{ago(project.updated)}</Stat>
        </dl>
      </span>
    </button>
  )
}
