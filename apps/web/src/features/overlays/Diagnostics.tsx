import type { Diagnostic, ProjectState } from '@scad/protocol'
import { AlertOctagon } from 'lucide-react'
import { location } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

export const Diagnostics = ({ project }: { project: ProjectState }) => {
  const versionId = useStore((s) => s.versionId)
  const render = project.render
  if (versionId || !render || render.status === 'ok') return null
  const errors = [
    ...(render.error ? [{ level: 'error', message: render.error } as Diagnostic] : []),
    ...render.parts.flatMap((p) => p.diagnostics.filter((d) => d.level === 'error').map((d) => ({ ...d, part: p.id }))),
  ]
  const stale = render.parts.some((p) => p.stale)
  return (
    <div className="diagnostics" role="alert">
      <header>
        <AlertOctagon size={16} />
        <strong>Render failed</strong>
        {stale && <span>showing the last good model</span>}
      </header>
      <ul>
        {errors.slice(0, 6).map((d) => (
          <li key={`${location(d)}${d.message}`}>
            {location(d) && <span className="mono loc">{location(d)}</span>}
            <span>{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
