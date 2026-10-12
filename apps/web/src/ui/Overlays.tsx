import type { Diagnostic, ProjectState } from '@scad/core/protocol'
import { AlertOctagon, X } from 'lucide-react'
import { useStore } from '../store.ts'
import { fmt } from '../viewer/Helpers.tsx'

const where = (d: Diagnostic) => (d.file ? `${d.file}${d.line ? `:${d.line}` : ''}` : '')

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
          <li key={`${where(d)}${d.message}`}>
            {where(d) && <span className="mono loc">{where(d)}</span>}
            <span>{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

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
        <button type="button" className="icon-btn" onClick={toggle}>
          <X size={14} />
        </button>
      </header>
      <ol className="mono">
        {lines.length === 0 && <li className="echo">No output.</li>}
        {lines.map((d) => (
          <li key={d.id} className={d.level}>
            <span className="lvl">{d.level.toUpperCase()}</span>
            <span className="part">{d.part}</span>
            {where(d) && <span className="loc">{where(d)}</span>}
            <span>{d.message}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export const TitleBlock = ({ project }: { project: ProjectState }) => {
  const versionId = useStore((s) => s.versionId)
  const ghostId = useStore((s) => s.ghostId)
  const edits = useStore((s) => s.edits)
  const bounds = useStore((s) => s.bounds)
  const solo = useStore((s) => s.solo)
  const tweaked = Object.keys(edits).length > 0 && !versionId
  const size = bounds ? bounds[1].map((v, i) => v - bounds[0][i]) : null
  const showing = versionId ?? (tweaked ? 'TWEAK' : project.versions.length ? 'WIP' : 'DRAFT')
  return (
    <div className="titleblock">
      <div className="tb-cell wide">
        <span className="tb-label">Project</span>
        <strong>{project.name}</strong>
      </div>
      <div className="tb-cell">
        <span className="tb-label">Showing</span>
        <span className={`mono ${tweaked ? 'amber' : ''}`}>{showing}</span>
      </div>
      <div className="tb-cell">
        <span className="tb-label">Overlay</span>
        <span className="mono cyan">{ghostId ?? '-'}</span>
      </div>
      <div className="tb-cell wide">
        <span className="tb-label">Envelope</span>
        <span className="mono">{size ? size.map((n) => fmt(n)).join(' x ') : '-'}</span>
      </div>
      <div className="tb-cell">
        <span className="tb-label">Part</span>
        <span className="mono">{solo ?? (project.parts.length > 1 ? 'ASSY' : project.parts[0]?.id)}</span>
      </div>
      <div className="tb-cell">
        <span className="tb-label">Units</span>
        <span className="mono">mm</span>
      </div>
      <div className="tb-cell">
        <span className="tb-label">Scale</span>
        <span className="mono">1:1</span>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['0', 'Isometric'],
  ['1 / 4', 'Front / back'],
  ['3 / 6', 'Right / left'],
  ['2 / 5', 'Top / bottom'],
  ['F', 'Fit model'],
  ['O', 'Ortho / perspective'],
  ['X', 'X-ray'],
  ['E', 'Edges'],
  ['W', 'Wireframe'],
  ['G', 'Build plate'],
  ['D', 'Bounding box'],
  ['S', 'Section'],
  ['M', 'Measure (click two points)'],
  ['Esc', 'Cancel / leave tool'],
  ['[ ]', 'Previous / next version'],
  ['B', 'Side panel'],
  ['V', 'Viewport only (?embed=1)'],
  ['C', 'Console'],
  ['?', 'This help'],
]

export const Help = () => {
  const open = useStore((s) => s.help)
  const toggle = useStore((s) => s.toggleHelp)
  if (!open) return null
  return (
    <div className="help">
      <div className="help-card">
        <header className="help-head">
          <h3>Keys</h3>
          <button type="button" className="icon-btn" onClick={toggle} title="Close (Esc)">
            <X size={14} />
          </button>
        </header>
        <dl>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt className="mono">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p>Drag to orbit, right-drag to pan, scroll to zoom. Click the cube to snap to faces, edges and corners.</p>
      </div>
    </div>
  )
}
