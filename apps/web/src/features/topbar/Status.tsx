import type { ProjectState } from '@scad/protocol'
import { Badge } from '../../components/Badge.tsx'
import { useStore } from '../../store/store.ts'

export const Status = ({ project }: { project: ProjectState | null }) => {
  const rendering = useStore((s) => s.rendering)
  const exporting = useStore((s) => s.exporting)
  const busy = rendering.preview || rendering.tweak || exporting
  const render = project?.render
  const warnings = render?.parts.reduce((n, p) => n + p.diagnostics.filter((d) => d.level === 'warning').length, 0) ?? 0
  const state = busy ? 'busy' : !render ? 'idle' : render.status
  const label = busy
    ? exporting
      ? 'exporting'
      : rendering.tweak
        ? 'rendering tweak'
        : 'rendering'
    : !render
      ? 'not rendered'
      : `${render.status === 'ok' ? 'rendered' : 'failed'} ${render.durationMs} ms`
  return (
    <div className={`status status-${state}`} title={label}>
      <span className="status-light" />
      <span className="mono">{label}</span>
      {warnings > 0 && !busy && <Badge tone="amber">{warnings} warn</Badge>}
    </div>
  )
}
