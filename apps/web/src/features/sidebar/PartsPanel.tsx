import type { AssemblyDef, PartDef, ProjectState } from '@scad/protocol'
import { AlertTriangle, Eye, EyeOff, Printer } from 'lucide-react'
import { cx } from '../../components/classes.ts'
import { IconButton } from '../../components/IconButton.tsx'
import { Panel } from '../../components/Panel.tsx'
import { fmtVec } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'
import { assemblyResult } from '../../viewer/model/source.ts'

const ViewSwitch = ({ project }: { project: ProjectState }) => {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  if (!project.assemblies.length) return null
  const tab = (mode: 'print' | 'assembly', label: string) => (
    <button
      key={mode}
      type="button"
      role="tab"
      aria-selected={viewMode === mode}
      className={cx('view-tab', viewMode === mode && 'is-active')}
      onClick={() => setViewMode(mode)}
    >
      {label}
    </button>
  )
  return (
    <div className="view-switch" role="tablist" aria-label="View">
      {tab('print', 'Print')}
      {tab('assembly', 'Assembly')}
    </div>
  )
}

const PrintRow = ({ project, part }: { project: ProjectState; part: PartDef }) => {
  const selectedPart = useStore((s) => s.selectedPart)
  const selectPart = useStore((s) => s.selectPart)
  const versionId = useStore((s) => s.versionId)
  const version = project.versions.find((v) => v.id === versionId)
  const result = version ? null : project.render?.parts.find((p) => p.id === part.id)
  const bbox = version ? version.parts.find((p) => p.id === part.id)?.bbox : result?.bbox
  const selected = selectedPart === part.id
  return (
    <li className={cx('part', selected && 'is-selected')}>
      <button
        type="button"
        className="part-name"
        onClick={() => selectPart(part.id)}
        title={selected ? 'Showing this part' : 'Show this part'}
      >
        <span>{part.label ?? part.id}</span>
        <small className="mono">{part.file}</small>
      </button>
      <span className="part-meta mono">
        {result?.status === 'error' && <AlertTriangle size={13} className="warn" />}
        {bbox ? fmtVec(bbox.size) : '-'}
      </span>
    </li>
  )
}

const assemblyFlags = (assembly: AssemblyDef) =>
  [assembly.preview ? 'preview' : null, assembly.export ? 'export' : null].filter(Boolean).join(', ')

const AssemblyRow = ({ project, assembly }: { project: ProjectState; assembly: AssemblyDef }) => {
  const selectedAssembly = useStore((s) => s.selectedAssembly)
  const selectAssembly = useStore((s) => s.selectAssembly)
  const versionId = useStore((s) => s.versionId)
  const edits = useStore((s) => s.edits)
  const selected = selectedAssembly === assembly.id
  const result = assemblyResult(project, versionId, Object.keys(edits).length > 0, assembly.id)
  const flags = assemblyFlags(assembly)
  return (
    <li className={cx('part', 'assembly-row', selected && 'is-selected')}>
      <button
        type="button"
        className="part-name"
        onClick={() => selectAssembly(assembly.id)}
        title={selected ? 'Showing this assembly' : 'Show this assembly'}
      >
        <span>{assembly.label ?? assembly.id}</span>
        <small className="mono">
          {result ? `${result.parts.length} part${result.parts.length === 1 ? '' : 's'}` : 'not rendered yet'}
          {flags && ` · ${flags}`}
        </small>
      </button>
      <span className="part-meta mono">{result?.bbox ? fmtVec(result.bbox.size) : '-'}</span>
    </li>
  )
}

const AssemblyPartRow = ({
  project,
  id,
  label,
  size,
}: {
  project: ProjectState
  id: string
  label?: string
  size: string | null
}) => {
  const assemblyHidden = useStore((s) => s.assemblyHidden)
  const toggleAssemblyPart = useStore((s) => s.toggleAssemblyPart)
  const peekPart = useStore((s) => s.peekPart)
  const setPeekPart = useStore((s) => s.setPeekPart)
  const openPart = useStore((s) => s.openPart)
  const visible = !assemblyHidden.includes(id)
  const known = project.parts.some((p) => p.id === id)
  return (
    <li className={cx('part', 'has-icons', !visible && 'is-hidden', peekPart === id && 'is-peek')}>
      <IconButton title={visible ? 'Hide in assembly' : 'Show in assembly'} onClick={() => toggleAssemblyPart(id)}>
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </IconButton>
      <button
        type="button"
        className="part-name"
        onClick={() => setPeekPart(peekPart === id ? null : id)}
        onDoubleClick={() => openPart(id)}
        title="Click to peek, double-click to open the part in print view"
      >
        <span>{label ?? id}</span>
        <small className="mono">{size ?? '-'}</small>
      </button>
      {known && (
        <IconButton title="Open in print view" onClick={() => openPart(id)}>
          <Printer size={14} />
        </IconButton>
      )}
    </li>
  )
}

const AssemblyDetails = ({ project }: { project: ProjectState }) => {
  const selectedAssembly = useStore((s) => s.selectedAssembly)
  const explode = useStore((s) => s.explode)
  const setExplode = useStore((s) => s.setExplode)
  const versionId = useStore((s) => s.versionId)
  const edits = useStore((s) => s.edits)
  const result = assemblyResult(project, versionId, Object.keys(edits).length > 0, selectedAssembly)
  if (!result) return null
  const labels = new Map(project.parts.map((p) => [p.id, p.label]))
  return (
    <div className="assembly-details">
      <span className="assembly-legend">Parts</span>
      <ul className="parts">
        {result.parts.map((p) => (
          <AssemblyPartRow
            key={p.id}
            project={project}
            id={p.id}
            label={labels.get(p.id)}
            size={p.bbox ? fmtVec(p.bbox.size) : null}
          />
        ))}
      </ul>
      <label className="assembly-explode">
        <span>
          Explode <em className="mono">{Math.round(explode * 100)}%</em>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(explode * 100)}
          onChange={(e) => setExplode(Number(e.target.value) / 100)}
          aria-label="Explode assembly"
        />
      </label>
    </div>
  )
}

export const PartsPanel = ({ project }: { project: ProjectState }) => {
  const viewMode = useStore((s) => s.viewMode)
  const inAssembly = viewMode === 'assembly'
  const count = inAssembly ? project.assemblies.length : project.parts.filter((p) => p.preview).length
  return (
    <Panel title={inAssembly ? 'Assembly' : 'Parts'} count={count}>
      <ViewSwitch project={project} />
      {inAssembly ? (
        <>
          <ul className="parts">
            {project.assemblies.map((assembly) => (
              <AssemblyRow key={assembly.id} project={project} assembly={assembly} />
            ))}
          </ul>
          <AssemblyDetails project={project} />
        </>
      ) : (
        <ul className="parts">
          {project.parts
            .filter((p) => p.preview)
            .map((part) => (
              <PrintRow key={part.id} project={project} part={part} />
            ))}
        </ul>
      )}
    </Panel>
  )
}
