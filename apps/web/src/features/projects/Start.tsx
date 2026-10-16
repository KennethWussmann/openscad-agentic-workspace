import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '../../components/classes.ts'
import { plural } from '../../lib/format.ts'
import { filterProjects, type ProjectSort, totals } from '../../lib/projects.ts'
import { useStore } from '../../store/store.ts'
import { ProjectCard } from './ProjectCard.tsx'

const SORTS: { id: ProjectSort; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'name', label: 'A-Z' },
]

const Hero = ({ count }: { count: number }) => {
  const projects = useStore((s) => s.projects)
  const sums = totals(projects)
  return (
    <header className="start-hero">
      <p className="start-eyebrow mono">scad workspace / live</p>
      <h1>
        {count === 0 ? 'Nothing on the table' : 'On the bench'}
        <span className="cursor">_</span>
      </h1>
      <p className="start-lede">
        Ask your agent to model something, or start a project with <code>pnpm scad new my-part</code>. Every card
        follows along live while the agent works.
      </p>
      {count > 0 && (
        <dl className="start-totals">
          <div>
            <dt className="mono">projects</dt>
            <dd>{sums.projects}</dd>
          </div>
          <div>
            <dt className="mono">parts</dt>
            <dd>{sums.parts}</dd>
          </div>
          <div>
            <dt className="mono">checkpoints</dt>
            <dd>{sums.versions}</dd>
          </div>
        </dl>
      )}
    </header>
  )
}

export const Start = () => {
  const projects = useStore((s) => s.projects)
  const selectProject = useStore((s) => s.selectProject)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>('recent')
  const shown = useMemo(() => filterProjects(projects, query, sort), [projects, query, sort])
  return (
    <div className="start">
      <div className="start-inner">
        <Hero count={projects.length} />
        {projects.length > 0 && (
          <>
            <div className="start-bar">
              <label className="start-search">
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Filter by name, id or description"
                  aria-label="Filter projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <span className="start-count mono">
                {shown.length === projects.length
                  ? plural(projects.length, 'project')
                  : `${shown.length} of ${projects.length}`}
              </span>
              <fieldset className="start-sort" aria-label="Sort projects">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cx('mono', sort === s.id && 'is-active')}
                    aria-pressed={sort === s.id}
                    onClick={() => setSort(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </fieldset>
            </div>
            {shown.length > 0 ? (
              <div className="start-grid">
                {shown.map((p, i) => (
                  <ProjectCard key={p.id} project={p} index={i} onOpen={selectProject} />
                ))}
              </div>
            ) : (
              <p className="start-none mono">No project matches "{query}".</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
