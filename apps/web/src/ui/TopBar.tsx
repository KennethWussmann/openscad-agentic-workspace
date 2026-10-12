import type { ProjectState, ProjectSummary } from '@scad/core/protocol'
import { HelpCircle, Maximize2, RefreshCw, SquareTerminal } from 'lucide-react'
import { requestRender } from '../api.ts'
import { useStore } from '../store.ts'

const Status = ({ project }: { project: ProjectState | null }) => {
  const rendering = useStore((s) => s.rendering)
  const busy = rendering.preview || rendering.tweak
  const render = project?.render
  const warnings = render?.parts.reduce((n, p) => n + p.diagnostics.filter((d) => d.level === 'warning').length, 0) ?? 0
  const state = busy ? 'busy' : !render ? 'idle' : render.status
  return (
    <div className={`status status-${state}`}>
      <span className="status-light" />
      <span className="mono">
        {busy
          ? rendering.tweak
            ? 'rendering tweak'
            : 'rendering'
          : !render
            ? 'not rendered'
            : `${render.status === 'ok' ? 'rendered' : 'failed'} ${render.durationMs} ms`}
      </span>
      {warnings > 0 && !busy && <span className="badge amber">{warnings} warn</span>}
    </div>
  )
}

export const TopBar = ({ projects, project }: { projects: ProjectSummary[]; project: ProjectState | null }) => {
  const projectId = useStore((s) => s.projectId)
  const selectProject = useStore((s) => s.selectProject)
  const toggleConsole = useStore((s) => s.toggleConsole)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const toggleEmbed = useStore((s) => s.toggleEmbed)
  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
          <path d="M16 3 28 10v12L16 29 4 22V10z" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M16 16 28 10M16 16v13M16 16 4 10" stroke="var(--amber)" strokeWidth="1.8" />
        </svg>
        <span className="brand-name">scad</span>
        <span className="brand-sub">workspace</span>
      </div>
      <div className="project-pick">
        <select value={projectId ?? ''} onChange={(e) => selectProject(e.target.value || null)}>
          <option value="">Select a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id}){p.proposal ? ' *' : ''}
            </option>
          ))}
        </select>
        {project?.description && <span className="project-desc">{project.description}</span>}
      </div>
      <div className="topbar-right">
        <Status project={project} />
        {project && (
          <button
            type="button"
            className="icon-btn"
            title="Render now"
            onClick={() => requestRender(project.id).catch(() => undefined)}
          >
            <RefreshCw size={15} />
          </button>
        )}
        <button type="button" className="icon-btn" title="Console (C)" onClick={toggleConsole}>
          <SquareTerminal size={15} />
        </button>
        {project && (
          <button type="button" className="icon-btn" title="Viewport only (V)" onClick={toggleEmbed}>
            <Maximize2 size={15} />
          </button>
        )}
        <button type="button" className="icon-btn" title="Keys (?)" onClick={toggleHelp}>
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  )
}
