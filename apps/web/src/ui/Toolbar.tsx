import type { PrintProcess, Vec3 } from '@scad/core/protocol'
import {
  ArrowDownFromLine,
  Box,
  Columns2,
  Crosshair,
  FlipVertical2,
  Grid3x3,
  Layers,
  MapPinPlus,
  Maximize,
  Move3d,
  Rotate3d,
  Ruler,
  Scan,
  Slice,
  Spline,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { type Axis, type Display, useStore } from '../store.ts'
import { fit, savePose } from '../viewer/rig.ts'

type ToolButtonProps = {
  active?: boolean
  label: string
  shortcut?: string
  onClick: () => void
  children: ReactNode
}

export const ToolButton = ({ active, label, shortcut, onClick, children }: ToolButtonProps) => (
  <button
    type="button"
    className={`tool${active ? ' is-active' : ''}`}
    onClick={onClick}
    title={shortcut ? `${label} (${shortcut})` : label}
    aria-pressed={active}
  >
    {children}
    <span className="tool-label">{label}</span>
  </button>
)

export const toggleOrtho = () => {
  savePose()
  useStore.getState().toggleDisplay('ortho')
}

const DISPLAY: { key: keyof Display; label: string; shortcut: string; icon: ReactNode }[] = [
  { key: 'xray', label: 'X-ray', shortcut: 'X', icon: <Scan size={16} /> },
  { key: 'edges', label: 'Edges', shortcut: 'E', icon: <Spline size={16} /> },
  { key: 'wireframe', label: 'Wireframe', shortcut: 'W', icon: <Layers size={16} /> },
  { key: 'grid', label: 'Plate', shortcut: 'G', icon: <Grid3x3 size={16} /> },
  { key: 'dims', label: 'Bounds', shortcut: 'D', icon: <Box size={16} /> },
]

const ANALYSIS: { key: keyof Display; label: string; shortcut: string; icon: ReactNode }[] = [
  { key: 'overhangs', label: 'Overhang', shortcut: 'H', icon: <ArrowDownFromLine size={16} /> },
  { key: 'walls', label: 'Walls', shortcut: 'T', icon: <Columns2 size={16} /> },
]

const AXES: Axis[] = ['x', 'y', 'z', 'free']

const SectionPanel = ({ range }: { range: [number, number] | null }) => {
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const [lo, hi] = range ?? [-50, 50]
  const span = Math.max(hi - lo, 1)
  const step = span > 200 ? 0.5 : span > 20 ? 0.1 : 0.01
  return (
    <div className="section-panel">
      <div className="section-row">
        {AXES.map((a) => (
          <button
            type="button"
            key={a}
            className={`chip${section.axis === a ? ' is-active' : ''}`}
            onClick={() => setSection({ axis: a })}
          >
            {a === 'free' ? 'FREE' : a.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          className={`chip icon${section.flip ? ' is-active' : ''}`}
          title="Flip kept side"
          onClick={() => setSection({ flip: !section.flip })}
        >
          <FlipVertical2 size={14} />
        </button>
      </div>
      {section.axis === 'free' ? (
        <div className="section-row">
          <button
            type="button"
            className={`chip${section.gizmo === 'translate' ? ' is-active' : ''}`}
            onClick={() => setSection({ gizmo: 'translate' })}
          >
            <Move3d size={14} /> Move
          </button>
          <button
            type="button"
            className={`chip${section.gizmo === 'rotate' ? ' is-active' : ''}`}
            onClick={() => setSection({ gizmo: 'rotate' })}
          >
            <Rotate3d size={14} /> Rotate
          </button>
        </div>
      ) : (
        <label className="section-slider">
          <span className="mono">
            {section.axis.toUpperCase()} = {section.offset.toFixed(2)}
          </span>
          <input
            type="range"
            min={lo - span * 0.02}
            max={hi + span * 0.02}
            step={step}
            value={section.offset}
            onChange={(e) => setSection({ offset: Number(e.target.value) })}
          />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={section.caps} onChange={() => setSection({ caps: !section.caps })} />
        Hatched caps
      </label>
    </div>
  )
}

const rangeOf = (bounds: [Vec3, Vec3] | null, axis: 'x' | 'y' | 'z'): [number, number] | null => {
  if (!bounds) return null
  const i = { x: 0, y: 1, z: 2 }[axis]
  return [bounds[0][i], bounds[1][i]]
}

export const Toolbar = ({ process }: { process: PrintProcess }) => {
  const bounds = useStore((s) => s.bounds)
  const display = useStore((s) => s.display)
  const toggle = useStore((s) => s.toggleDisplay)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const measures = useStore((s) => s.measures)
  const clearMeasures = useStore((s) => s.clearMeasures)
  return (
    <div className="toolbar">
      <div className="tool-group">
        <ToolButton label="Fit" shortcut="F" onClick={() => fit()}>
          <Maximize size={16} />
        </ToolButton>
        <ToolButton label={display.ortho ? 'Ortho' : 'Persp'} shortcut="O" active={display.ortho} onClick={toggleOrtho}>
          <span className="glyph">{display.ortho ? '[]' : '<>'}</span>
        </ToolButton>
      </div>
      <div className="tool-group">
        {DISPLAY.map((d) => (
          <ToolButton
            key={d.key}
            label={d.label}
            shortcut={d.shortcut}
            active={display[d.key]}
            onClick={() => toggle(d.key)}
          >
            {d.icon}
          </ToolButton>
        ))}
      </div>
      <div className="tool-group">
        {ANALYSIS.map((d) => (
          <ToolButton
            key={d.key}
            label={d.key === 'overhangs' && process === 'resin' ? 'Islands' : d.label}
            shortcut={d.shortcut}
            active={display[d.key]}
            onClick={() => toggle(d.key)}
          >
            {d.icon}
          </ToolButton>
        ))}
      </div>
      <div className="tool-group">
        <ToolButton
          label="Section"
          shortcut="S"
          active={section.enabled}
          onClick={() => setSection({ enabled: !section.enabled })}
        >
          <Slice size={16} />
        </ToolButton>
        <ToolButton
          label="Measure"
          shortcut="M"
          active={tool === 'measure'}
          onClick={() => setTool(tool === 'measure' ? 'orbit' : 'measure')}
        >
          <Ruler size={16} />
        </ToolButton>
        <ToolButton
          label="Note"
          shortcut="N"
          active={tool === 'annotate'}
          onClick={() => setTool(tool === 'annotate' ? 'orbit' : 'annotate')}
        >
          <MapPinPlus size={16} />
        </ToolButton>
        {measures.length > 0 && (
          <ToolButton label="Clear" onClick={clearMeasures}>
            <Crosshair size={16} />
          </ToolButton>
        )}
      </div>
      {section.enabled && <SectionPanel range={section.axis === 'free' ? null : rangeOf(bounds, section.axis)} />}
    </div>
  )
}
