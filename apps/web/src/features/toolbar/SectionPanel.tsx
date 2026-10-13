import { FlipVertical2, Move3d, Rotate3d } from 'lucide-react'
import { Chip } from '../../components/Chip.tsx'
import { type Axis, useStore } from '../../store/store.ts'

const AXES: Axis[] = ['x', 'y', 'z', 'free']

const OffsetSlider = ({ range }: { range: [number, number] | null }) => {
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const [lo, hi] = range ?? [-50, 50]
  const span = Math.max(hi - lo, 1)
  const step = span > 200 ? 0.5 : span > 20 ? 0.1 : 0.01
  return (
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
  )
}

export const SectionPanel = ({ range }: { range: [number, number] | null }) => {
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  return (
    <div className="section-panel">
      <div className="section-row">
        {AXES.map((a) => (
          <Chip key={a} active={section.axis === a} onClick={() => setSection({ axis: a })}>
            {a.toUpperCase()}
          </Chip>
        ))}
        <Chip icon active={section.flip} title="Flip kept side" onClick={() => setSection({ flip: !section.flip })}>
          <FlipVertical2 size={14} />
        </Chip>
      </div>
      {section.axis === 'free' ? (
        <div className="section-row">
          <Chip active={section.gizmo === 'translate'} onClick={() => setSection({ gizmo: 'translate' })}>
            <Move3d size={14} /> Move
          </Chip>
          <Chip active={section.gizmo === 'rotate'} onClick={() => setSection({ gizmo: 'rotate' })}>
            <Rotate3d size={14} /> Rotate
          </Chip>
        </div>
      ) : (
        <OffsetSlider range={range} />
      )}
      <label className="check">
        <input type="checkbox" checked={section.caps} onChange={() => setSection({ caps: !section.caps })} />
        Hatched caps
      </label>
    </div>
  )
}
