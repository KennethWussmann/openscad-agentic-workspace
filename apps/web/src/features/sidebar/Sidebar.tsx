import type { ProjectState } from '@scad/protocol'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cx } from '../../components/classes.ts'
import { IconButton } from '../../components/IconButton.tsx'
import { useStore } from '../../store/store.ts'
import { NotesPanel } from './NotesPanel.tsx'
import { ParamsPanel } from './ParamsPanel.tsx'
import { PartsPanel } from './PartsPanel.tsx'

const RailLabel = ({ label, count }: { label: string; count: number }) => (
  <span className="rail-label">
    {label} <em className="mono">{count}</em>
  </span>
)

const Rail = ({ project }: { project: ProjectState }) => {
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const changed = useStore((s) => Object.keys(s.edits).length)
  const notes = useStore((s) => s.notes.length)
  return (
    <button type="button" className="sidebar-rail" onClick={toggleSidebar} title="Show panel (B)">
      <PanelLeftOpen size={15} />
      <RailLabel label="Parts" count={project.parts.length} />
      <RailLabel label="Notes" count={notes} />
      <RailLabel label="Parameters" count={project.render?.params.length ?? 0} />
      {changed > 0 && <span className="rail-badge mono">{changed}</span>}
    </button>
  )
}

export const Sidebar = ({ project }: { project: ProjectState }) => {
  const open = useStore((s) => s.sidebar)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  return (
    <aside className={cx('sidebar', !open && 'is-collapsed')}>
      <div className="sidebar-body" inert={!open}>
        <header className="sidebar-head">
          <span className="mono">Inspector</span>
          <IconButton title="Hide panel (B)" onClick={toggleSidebar}>
            <PanelLeftClose size={14} />
          </IconButton>
        </header>
        <PartsPanel project={project} />
        <NotesPanel project={project} />
        <ParamsPanel project={project} />
      </div>
      <div className="sidebar-rail-wrap" inert={open}>
        <Rail project={project} />
      </div>
    </aside>
  )
}
