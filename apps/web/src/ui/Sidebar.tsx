import type { DefineValue, ParamDef, ProjectState } from '@scad/core/protocol'
import { AlertTriangle, Eye, EyeOff, PanelLeftClose, PanelLeftOpen, RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { clearTweak, sendProposal } from '../api.ts'
import { useStore } from '../store.ts'
import { fmt } from '../viewer/Helpers.tsx'
import { NotesPanel } from './NotesPanel.tsx'

const Parts = ({ project }: { project: ProjectState }) => {
  const hidden = useStore((s) => s.hidden)
  const solo = useStore((s) => s.solo)
  const togglePart = useStore((s) => s.togglePart)
  const setSolo = useStore((s) => s.setSolo)
  const versionId = useStore((s) => s.versionId)
  const version = project.versions.find((v) => v.id === versionId)
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Parts</h2>
        <span className="count">{project.parts.length}</span>
        {solo && (
          <button type="button" className="link" onClick={() => setSolo(null)}>
            show all
          </button>
        )}
      </header>
      <ul className="parts">
        {project.parts
          .filter((p) => p.preview)
          .map((part) => {
            const result = version ? null : project.render?.parts.find((p) => p.id === part.id)
            const bbox = version ? version.parts.find((p) => p.id === part.id)?.bbox : result?.bbox
            const visible = solo ? solo === part.id : !hidden.includes(part.id)
            const failed = result?.status === 'error'
            return (
              <li key={part.id} className={`part${visible ? '' : ' is-hidden'}${solo === part.id ? ' is-solo' : ''}`}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => togglePart(part.id)}
                  title="Toggle visibility"
                >
                  {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  className="part-name"
                  onClick={() => setSolo(solo === part.id ? null : part.id)}
                  title="Solo this part"
                >
                  <span>{part.label ?? part.id}</span>
                  <small className="mono">{part.file}</small>
                </button>
                <span className="part-meta mono">
                  {failed && <AlertTriangle size={13} className="warn" />}
                  {bbox ? bbox.size.map((n) => fmt(n)).join(' x ') : '-'}
                </span>
              </li>
            )
          })}
      </ul>
    </section>
  )
}

const ParamInput = ({
  def,
  value,
  onChange,
}: {
  def: ParamDef
  value: DefineValue
  onChange: (v: DefineValue) => void
}) => {
  if (def.options)
    return (
      <select value={JSON.stringify(value)} onChange={(e) => onChange(JSON.parse(e.target.value) as DefineValue)}>
        {def.options.map((o) => (
          <option key={JSON.stringify(o.value)} value={JSON.stringify(o.value)}>
            {o.name}
          </option>
        ))}
      </select>
    )
  if (def.type === 'boolean')
    return (
      <button type="button" className={`switch${value ? ' is-on' : ''}`} onClick={() => onChange(!value)}>
        <span />
      </button>
    )
  if (def.type === 'number') {
    const n = Number(value)
    const ranged = def.min !== undefined && def.max !== undefined
    return (
      <div className="num">
        {ranged && (
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step ?? 'any'}
            value={n}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        )}
        <input
          type="number"
          className="mono"
          step={def.step ?? 'any'}
          value={n}
          onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
        />
      </div>
    )
  }
  if (def.type === 'vector') return <VectorInput value={value} onChange={onChange} />
  return <input type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />
}

const VectorInput = ({ value, onChange }: { value: DefineValue; onChange: (v: DefineValue) => void }) => {
  const [text, setText] = useState(JSON.stringify(value))
  const [bad, setBad] = useState(false)
  return (
    <input
      type="text"
      className={`mono${bad ? ' is-bad' : ''}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        try {
          const parsed = JSON.parse(e.target.value) as DefineValue
          setBad(!Array.isArray(parsed))
          if (Array.isArray(parsed)) onChange(parsed)
        } catch {
          setBad(true)
        }
      }}
    />
  )
}

const Params = ({ project }: { project: ProjectState }) => {
  const edits = useStore((s) => s.edits)
  const setEdit = useStore((s) => s.setEdit)
  const resetEdits = useStore((s) => s.resetEdits)
  const versionId = useStore((s) => s.versionId)
  const tweakRendering = useStore((s) => s.rendering.tweak)
  const [note, setNote] = useState('')
  const params = project.render?.params ?? []
  const changed = Object.keys(edits).length
  const groups = new Map<string, ParamDef[]>()
  for (const p of params) {
    const g = p.group ?? 'Parameters'
    groups.set(g, [...(groups.get(g) ?? []), p])
  }
  const tweakError = changed > 0 && project.tweak?.status === 'error'
  return (
    <section className="panel grow">
      <header className="panel-head">
        <h2>Parameters</h2>
        <span className="count">{params.length}</span>
        {changed > 0 && <span className="badge amber">{tweakRendering ? 'rendering' : `${changed} tweaked`}</span>}
      </header>
      {versionId && <p className="hint">Viewing {versionId}. Tweaks apply to the working copy.</p>}
      {params.length === 0 && (
        <p className="hint">No customizer parameters. Top-level assignments with literal values show up here.</p>
      )}
      <div className="params">
        {[...groups].map(([group, defs]) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {defs.map((def) => {
              const value = edits[def.name] ?? def.initial
              const isEdited = def.name in edits
              return (
                <div key={def.name} className={`param${isEdited ? ' is-edited' : ''}`} title={def.caption}>
                  <div className="param-head">
                    <span className="mono">{def.name}</span>
                    {isEdited && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setEdit(def.name, undefined)}
                        title="Reset"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                  {def.caption && <small>{def.caption}</small>}
                  <ParamInput
                    def={def}
                    value={value}
                    onChange={(v) =>
                      setEdit(def.name, JSON.stringify(v) === JSON.stringify(def.initial) ? undefined : v)
                    }
                  />
                </div>
              )
            })}
          </fieldset>
        ))}
      </div>
      {tweakError && (
        <p className="hint error">
          Tweak failed:{' '}
          {project.tweak?.parts
            .flatMap((p) => p.diagnostics.filter((d) => d.level === 'error'))
            .map((d) => d.message)[0] ?? project.tweak?.error}
        </p>
      )}
      {changed > 0 && (
        <div className="proposal">
          <textarea
            placeholder="Note for the agent (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="proposal-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                resetEdits()
                clearTweak(project.id).catch(() => undefined)
              }}
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => sendProposal(project.id, edits, note).then(() => setNote(''))}
            >
              <Send size={14} /> Send to agent
            </button>
          </div>
        </div>
      )}
      {project.proposals.params && (
        <p className="hint ok">
          Sent to the agent: {Object.keys(project.proposals.params.params).join(', ')}. Ask it to apply the proposal.
        </p>
      )}
    </section>
  )
}

const Rail = ({ project }: { project: ProjectState }) => {
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const changed = useStore((s) => Object.keys(s.edits).length)
  const notes = useStore((s) => s.notes.length)
  const params = project.render?.params.length ?? 0
  return (
    <button type="button" className="sidebar-rail" onClick={toggleSidebar} title="Show panel (B)">
      <PanelLeftOpen size={15} />
      <span className="rail-label">
        Parts <em className="mono">{project.parts.length}</em>
      </span>
      <span className="rail-label">
        Notes <em className="mono">{notes}</em>
      </span>
      <span className="rail-label">
        Parameters <em className="mono">{params}</em>
      </span>
      {changed > 0 && <span className="rail-badge mono">{changed}</span>}
    </button>
  )
}

export const Sidebar = ({ project }: { project: ProjectState }) => {
  const open = useStore((s) => s.sidebar)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  return (
    <aside className={`sidebar${open ? '' : ' is-collapsed'}`}>
      <div className="sidebar-body" inert={!open}>
        <header className="sidebar-head">
          <span className="mono">Inspector</span>
          <button type="button" className="icon-btn" onClick={toggleSidebar} title="Hide panel (B)">
            <PanelLeftClose size={14} />
          </button>
        </header>
        <Parts project={project} />
        <NotesPanel project={project} />
        <Params project={project} />
      </div>
      <div className="sidebar-rail-wrap" inert={open}>
        <Rail project={project} />
      </div>
    </aside>
  )
}
