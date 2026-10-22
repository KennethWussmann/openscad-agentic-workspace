import type { ProjectState, ProjectSummary } from '@scad/protocol'
import { HelpCircle, Maximize2, RefreshCw, SquareTerminal } from 'lucide-react'
import { api } from '../../api/client.ts'
import { IconButton } from '../../components/IconButton.tsx'
import { useStore } from '../../store/store.ts'
import { ExportButton } from './ExportButton.tsx'
import { Status } from './Status.tsx'

const Brand = () => (
  <button type="button" className="brand" title="Start page" onClick={() => useStore.getState().selectProject(null)}>
    <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
      <path d="M16 3 28 10v12L16 29 4 22V10z" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16 16 28 10M16 16v13M16 16 4 10" stroke="var(--amber)" strokeWidth="1.8" />
    </svg>
    <span className="brand-name">scad</span>
    <span className="brand-sub">workspace</span>
  </button>
)

const ProjectPicker = ({ projects, project }: { projects: ProjectSummary[]; project: ProjectState | null }) => {
  const projectId = useStore((s) => s.projectId)
  const selectProject = useStore((s) => s.selectProject)
  return (
    <div className="project-pick">
      <select aria-label="Project" value={projectId ?? ''} onChange={(e) => selectProject(e.target.value || null)}>
        <option value="">Select a project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.id}){p.proposal ? ' *' : ''}
          </option>
        ))}
      </select>
      {project?.description && <span className="project-desc">{project.description}</span>}
    </div>
  )
}

export const TopBar = ({ projects, project }: { projects: ProjectSummary[]; project: ProjectState | null }) => {
  const toggleConsole = useStore((s) => s.toggleConsole)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const toggleEmbed = useStore((s) => s.toggleEmbed)
  const projectId = useStore((s) => s.projectId)
  if (!projectId)
    return (
      <header className="topbar">
        <Brand />
      </header>
    )
  return (
    <header className="topbar">
      <Brand />
      <ProjectPicker projects={projects} project={project} />
      <div className="topbar-right">
        <Status project={project} />
        {project && (
          <IconButton title="Render now" onClick={() => api.render(project.id).catch(() => undefined)}>
            <RefreshCw size={15} />
          </IconButton>
        )}
        {project && <ExportButton project={project} />}
        <IconButton title="Console (C)" onClick={toggleConsole}>
          <SquareTerminal size={15} />
        </IconButton>
        {project && (
          <IconButton title="Viewport only (V)" onClick={toggleEmbed}>
            <Maximize2 size={15} />
          </IconButton>
        )}
        <IconButton title="Keys (?)" className="topbar-keys" onClick={toggleHelp}>
          <HelpCircle size={15} />
        </IconButton>
      </div>
    </header>
  )
}
