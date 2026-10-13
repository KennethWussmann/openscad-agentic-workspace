import { useStore } from '../../store/store.ts'

export const Empty = () => {
  const projects = useStore((s) => s.projects)
  const selectProject = useStore((s) => s.selectProject)
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>
          Nothing on the table <span className="cursor">_</span>
        </h1>
        <p>
          Ask your agent to model something, or start a project with <code>pnpm scad new my-part</code>. This page
          follows along live while the agent works.
        </p>
        {projects.length > 0 && (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => selectProject(p.id)}>
                  <strong>{p.name}</strong>
                  <span className="mono">
                    {p.id} / {p.versions} versions / {p.status}
                  </span>
                  {p.description && <small>{p.description}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
