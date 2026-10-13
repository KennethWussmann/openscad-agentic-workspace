import type { PrintProcess, Vec3 } from '@scad/protocol'
import {
  ArrowDownFromLine,
  Box,
  Columns2,
  Crosshair,
  Grid3x3,
  Layers,
  MapPinPlus,
  Maximize,
  Ruler,
  Scan,
  Slice,
  Spline,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { ToolButton } from '../../components/ToolButton.tsx'
import { type Display, type Tool, useStore } from '../../store/store.ts'
import { fit, toggleOrtho } from '../../viewer/camera/rig.ts'
import { SectionPanel } from './SectionPanel.tsx'

type DisplayToggle = { key: keyof Display; label: string; shortcut: string; icon: ReactNode }

const DISPLAY: DisplayToggle[] = [
  { key: 'xray', label: 'X-ray', shortcut: 'X', icon: <Scan size={16} /> },
  { key: 'edges', label: 'Edges', shortcut: 'E', icon: <Spline size={16} /> },
  { key: 'wireframe', label: 'Wireframe', shortcut: 'W', icon: <Layers size={16} /> },
  { key: 'grid', label: 'Plate', shortcut: 'G', icon: <Grid3x3 size={16} /> },
  { key: 'dims', label: 'Bounds', shortcut: 'D', icon: <Box size={16} /> },
]

const ANALYSIS: DisplayToggle[] = [
  { key: 'overhangs', label: 'Overhang', shortcut: 'H', icon: <ArrowDownFromLine size={16} /> },
  { key: 'walls', label: 'Walls', shortcut: 'T', icon: <Columns2 size={16} /> },
]

const rangeOf = (bounds: [Vec3, Vec3] | null, axis: 'x' | 'y' | 'z'): [number, number] | null => {
  if (!bounds) return null
  const i = { x: 0, y: 1, z: 2 }[axis]
  return [bounds[0][i], bounds[1][i]]
}

const DisplayGroup = ({ toggles, label }: { toggles: DisplayToggle[]; label?: (t: DisplayToggle) => string }) => {
  const display = useStore((s) => s.display)
  const toggle = useStore((s) => s.toggleDisplay)
  return (
    <div className="tool-group">
      {toggles.map((d) => (
        <ToolButton
          key={d.key}
          label={label ? label(d) : d.label}
          shortcut={d.shortcut}
          active={display[d.key]}
          onClick={() => toggle(d.key)}
        >
          {d.icon}
        </ToolButton>
      ))}
    </div>
  )
}

const ModeButton = ({
  mode,
  label,
  shortcut,
  icon,
}: {
  mode: Tool
  label: string
  shortcut: string
  icon: ReactNode
}) => {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  return (
    <ToolButton
      label={label}
      shortcut={shortcut}
      active={tool === mode}
      onClick={() => setTool(tool === mode ? 'orbit' : mode)}
    >
      {icon}
    </ToolButton>
  )
}

export const Toolbar = ({ process }: { process: PrintProcess }) => {
  const bounds = useStore((s) => s.bounds)
  const ortho = useStore((s) => s.display.ortho)
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
        <ToolButton label={ortho ? 'Ortho' : 'Persp'} shortcut="O" active={ortho} onClick={toggleOrtho}>
          <span className="glyph">{ortho ? '[]' : '<>'}</span>
        </ToolButton>
      </div>
      <DisplayGroup toggles={DISPLAY} />
      <DisplayGroup
        toggles={ANALYSIS}
        label={(d) => (d.key === 'overhangs' && process === 'resin' ? 'Islands' : d.label)}
      />
      <div className="tool-group">
        <ToolButton
          label="Section"
          shortcut="S"
          active={section.enabled}
          onClick={() => setSection({ enabled: !section.enabled })}
        >
          <Slice size={16} />
        </ToolButton>
        <ModeButton mode="measure" label="Measure" shortcut="M" icon={<Ruler size={16} />} />
        <ModeButton mode="annotate" label="Note" shortcut="N" icon={<MapPinPlus size={16} />} />
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
