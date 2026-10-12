import { Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { announce, clearTweak, connect, fetchProject, fetchProjects, requestTweak } from './api.ts'
import { useStore } from './store.ts'
import { AnalysisLegend, Console, Diagnostics, Help, TitleBlock } from './ui/Overlays.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { Timeline } from './ui/Timeline.tsx'
import { Toolbar, toggleOrtho } from './ui/Toolbar.tsx'
import { TopBar } from './ui/TopBar.tsx'
import { fit, VIEWS, viewDirection } from './viewer/rig.ts'
import { ViewCube } from './viewer/ViewCube.tsx'
import { Viewport } from './viewer/Viewport.tsx'

const KEY_VIEWS: Record<string, Vector3> = {
  '0': VIEWS.iso,
  '1': VIEWS.front,
  '2': VIEWS.top,
  '3': VIEWS.right,
  '4': VIEWS.back,
  '5': VIEWS.bottom,
  '6': VIEWS.left,
}

const useServer = () => {
  const refreshList = useCallback(() => {
    fetchProjects()
      .then((p) => useStore.getState().setProjects(p))
      .catch(() => undefined)
  }, [])

  const refreshProject = useCallback(() => {
    const id = useStore.getState().projectId
    if (!id) {
      useStore.getState().setProject(null)
      return
    }
    fetchProject(id)
      .then((p) => {
        if (useStore.getState().projectId === id) useStore.getState().setProject(p)
      })
      .catch((e: unknown) => useStore.getState().setProject(null, e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(
    () =>
      connect(
        {
          onRenderStart: (e) => {
            if (e.project === useStore.getState().projectId) useStore.getState().setRendering(e.kind, true)
          },
          onRender: (e) => {
            refreshList()
            if (e.project !== useStore.getState().projectId) return
            useStore.getState().setRendering(e.kind, false)
            refreshProject()
          },
          onChanged: (e) => {
            refreshList()
            if (e.project === useStore.getState().projectId) refreshProject()
          },
          onNavigate: (e) => useStore.getState().selectProject(e.project),
        },
        () => useStore.getState().projectId,
      ),
    [refreshList, refreshProject],
  )

  const projectId = useStore((s) => s.projectId)
  useEffect(() => {
    announce(projectId)
    refreshList()
    refreshProject()
  }, [projectId, refreshList, refreshProject])

  return refreshProject
}

const useTweaks = (refreshProject: () => void) => {
  const edits = useStore((s) => s.edits)
  const projectId = useStore((s) => s.projectId)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!projectId) return
    const timer = setTimeout(() => {
      const task = Object.keys(edits).length ? requestTweak(projectId, edits) : clearTweak(projectId)
      task.then(refreshProject).catch(() => undefined)
    }, 350)
    return () => clearTimeout(timer)
  }, [edits, projectId, refreshProject])
}

const useKeys = () => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()
      const view = KEY_VIEWS[e.key]
      if (view) return viewDirection(new Vector3().copy(view))
      const versions = s.project?.versions ?? []
      const step = (dir: number) => {
        const ids = [...versions.map((v) => v.id), null]
        const i = ids.indexOf(s.versionId)
        s.setVersion(ids[Math.max(0, Math.min(ids.length - 1, i + dir))] ?? null)
      }
      const actions: Record<string, () => void> = {
        f: () => fit(),
        o: toggleOrtho,
        x: () => s.toggleDisplay('xray'),
        e: () => s.toggleDisplay('edges'),
        w: () => s.toggleDisplay('wireframe'),
        g: () => s.toggleDisplay('grid'),
        d: () => s.toggleDisplay('dims'),
        h: () => s.toggleDisplay('overhangs'),
        t: () => s.toggleDisplay('walls'),
        s: () => s.setSection({ enabled: !s.section.enabled }),
        m: () => s.setTool(s.tool === 'measure' ? 'orbit' : 'measure'),
        n: () => {
          if (!s.embed) s.setTool(s.tool === 'annotate' ? 'orbit' : 'annotate')
        },
        c: () => s.toggleConsole(),
        b: () => s.toggleSidebar(),
        v: () => s.toggleEmbed(),
        '?': () => s.toggleHelp(),
        '[': () => step(-1),
        ']': () => step(1),
        Escape: () => {
          if (s.help) s.toggleHelp()
          else if (s.editing !== null) s.closeEditor()
          else if (s.pending) s.cancelPending()
          else if (s.tool !== 'orbit') s.setTool('orbit')
        },
      }
      const action = actions[e.key] ?? actions[e.key.toLowerCase()]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

const Empty = () => {
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

export const App = () => {
  const refreshProject = useServer()
  useTweaks(refreshProject)
  useKeys()
  const projects = useStore((s) => s.projects)
  const project = useStore((s) => s.project)
  const error = useStore((s) => s.error)
  const tool = useStore((s) => s.tool)
  const pending = useStore((s) => s.pending)
  const rendering = useStore((s) => s.rendering.preview)
  const embed = useStore((s) => s.embed)
  const toggleEmbed = useStore((s) => s.toggleEmbed)
  return (
    <div className={`app${embed ? ' is-embed' : ''}`}>
      {!embed && <TopBar projects={projects} project={project} />}
      <div className={`progress${rendering ? ' is-on' : ''}`} />
      {project ? (
        <main className="workbench">
          {!embed && <Sidebar project={project} />}
          <section className="stage">
            <div className="stage-canvas">
              <Viewport project={project} />
            </div>
            {embed ? (
              <button type="button" className="embed-exit" onClick={toggleEmbed} title="Leave viewport mode (V)">
                <Minimize2 size={13} />
                <span className="mono">V</span>
              </button>
            ) : (
              <>
                <Toolbar process={project.profile.process} />
                <ViewCube />
              </>
            )}
            <Diagnostics project={project} />
            {tool === 'measure' && (
              <div className="tool-hint mono">
                {pending ? 'pick the second point' : 'pick the first point, vertices snap'}
              </div>
            )}
            {tool === 'annotate' && !embed && (
              <div className="tool-hint mono">click a face, edge or corner to pin a note</div>
            )}
            {!embed && <TitleBlock project={project} />}
            {!embed && <AnalysisLegend project={project} />}
            <Console project={project} />
            {!embed && <Timeline project={project} />}
          </section>
        </main>
      ) : (
        <main className="workbench">
          {error ? (
            <div className="empty">
              <p className="hint error">{error}</p>
            </div>
          ) : (
            <Empty />
          )}
        </main>
      )}
      <Help />
    </div>
  )
}
