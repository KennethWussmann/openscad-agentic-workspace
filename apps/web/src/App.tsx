import { cx } from './components/classes.ts'
import { Hint } from './components/Hint.tsx'
import { Help } from './features/overlays/Help.tsx'
import { Empty } from './features/projects/Empty.tsx'
import { Sidebar } from './features/sidebar/Sidebar.tsx'
import { Stage } from './features/stage/Stage.tsx'
import { TopBar } from './features/topbar/TopBar.tsx'
import { useKeys } from './hooks/useKeys.ts'
import { useServer } from './hooks/useServer.ts'
import { useTweaks } from './hooks/useTweaks.ts'
import { useStore } from './store/store.ts'

export const App = () => {
  const refreshProject = useServer()
  useTweaks(refreshProject)
  useKeys()
  const projects = useStore((s) => s.projects)
  const project = useStore((s) => s.project)
  const error = useStore((s) => s.error)
  const busy = useStore((s) => s.rendering.preview || s.exporting)
  const embed = useStore((s) => s.embed)
  return (
    <div className={cx('app', embed && 'is-embed')}>
      {!embed && <TopBar projects={projects} project={project} />}
      <div className={cx('progress', busy && 'is-on')} />
      <main className="workbench">
        {project ? (
          <>
            {!embed && <Sidebar project={project} />}
            <Stage project={project} />
          </>
        ) : error ? (
          <div className="empty">
            <Hint tone="error">{error}</Hint>
          </div>
        ) : (
          <Empty />
        )}
      </main>
      <Help />
    </div>
  )
}
