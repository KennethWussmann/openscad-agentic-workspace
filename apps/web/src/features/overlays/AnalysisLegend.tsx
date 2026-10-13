import { wallLimits } from '@scad/geometry'
import type { ProjectState } from '@scad/protocol'
import { fmt } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'
import { HEAT } from '../../viewer/analysis/heat.ts'

const css = (c: { getStyle: () => string }) => c.getStyle()

export const AnalysisLegend = ({ project }: { project: ProjectState }) => {
  const analysis = useStore((s) => s.analysis)
  if (!analysis) return null
  const s = project.profile
  const limits = wallLimits(s)
  const mode = analysis.mode
  const stops =
    mode === 'walls'
      ? [`${css(HEAT.red)} 0%`, `${css(HEAT.amber)} 50%`, `${css(HEAT.neutral)} 100%`]
      : [`${css(HEAT.amber)} 0%`, `${css(HEAT.red)} 100%`]
  const ticks =
    mode === 'walls'
      ? [`${fmt(limits.fail)}`, `${fmt(limits.warn)}`, `${fmt(2 * limits.warn)} mm`]
      : s.process === 'fdm'
        ? [`${s.overhangAngle}\u00b0`, '90\u00b0']
        : ['unsupported start points']
  const stat = analysis.busy
    ? 'measuring...'
    : analysis.extreme === null
      ? mode === 'walls'
        ? `nothing under ${fmt(limits.warn)} mm`
        : s.process === 'fdm'
          ? `nothing past ${s.overhangAngle}\u00b0`
          : 'no islands'
      : mode === 'walls'
        ? `${fmt(analysis.area)} mm\u00b2 under ${fmt(limits.warn)}, min ${fmt(analysis.extreme)} mm`
        : mode === 'islands'
          ? `${analysis.extreme} island${analysis.extreme === 1 ? '' : 's'} need supports`
          : `${fmt(analysis.area)} mm\u00b2, up to ${fmt(analysis.extreme)}\u00b0`
  const title = mode === 'walls' ? 'Wall thickness' : mode === 'islands' ? 'Islands' : 'Overhang from vertical'
  return (
    <div className={`legend ${mode === 'walls' ? 'is-walls' : 'is-overhang'}`}>
      <header>
        <span className="tb-label">{title}</span>
        <span className="mono">{mode === 'walls' ? 'T' : 'H'}</span>
      </header>
      <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
      <div className="legend-ticks mono">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {mode !== 'walls' && (
        <div className="legend-key mono">
          <i style={{ background: css(HEAT.bed) }} /> on the bed, ignored
        </div>
      )}
      <div className={`legend-stat mono${analysis.extreme === null || analysis.busy ? '' : ' amber'}`}>{stat}</div>
      <div className="legend-hint mono">pnpm scad check {project.id}</div>
    </div>
  )
}
