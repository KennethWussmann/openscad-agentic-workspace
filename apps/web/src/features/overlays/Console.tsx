import type { ProjectState } from '@scad/protocol'
import { X } from 'lucide-react'
import { IconButton } from '../../components/IconButton.tsx'
import { location } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

export const Console = ({ project }: { project: ProjectState }) => {
  const open = useStore((s) => s.console)
  const toggle = useStore((s) => s.toggleConsole)
  if (!open) return null
  const lines =
    project.render?.parts.flatMap((p) => p.diagnostics.map((d, n) => ({ ...d, part: p.id, id: `${p.id}:${n}` }))) ?? []
  return (
    <div className="console">
      <header>
        <strong>Console</strong>
        <span className="mono">{lines.length} lines</span>
        <IconButton onClick={toggle}>
          <X size={14} />
        </IconButton>
      </header>
      <ol className="mono">
        {lines.length === 0 && <li className="echo">No output.</li>}
        {lines.map((d) => (
          <li key={d.id} className={d.level}>
            <span className="lvl">{d.level.toUpperCase()}</span>
            <span className="part">{d.part}</span>
            {location(d) && <span className="loc">{location(d)}</span>}
            <span>{d.message}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
