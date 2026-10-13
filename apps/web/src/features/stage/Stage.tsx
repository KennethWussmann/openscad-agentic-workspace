import type { ProjectState } from '@scad/protocol'
import { Minimize2 } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { Viewport } from '../../viewer/Viewport.tsx'
import { ViewCube } from '../../viewer/viewcube/ViewCube.tsx'
import { AnalysisLegend } from '../overlays/AnalysisLegend.tsx'
import { Console } from '../overlays/Console.tsx'
import { Diagnostics } from '../overlays/Diagnostics.tsx'
import { ExportToast } from '../overlays/ExportToast.tsx'
import { TitleBlock } from '../overlays/TitleBlock.tsx'
import { ToolHint } from '../overlays/ToolHint.tsx'
import { Timeline } from '../timeline/Timeline.tsx'
import { Toolbar } from '../toolbar/Toolbar.tsx'

const EmbedExit = () => {
  const toggleEmbed = useStore((s) => s.toggleEmbed)
  return (
    <button type="button" className="embed-exit" onClick={toggleEmbed} title="Leave viewport mode (V)">
      <Minimize2 size={13} />
      <span className="mono">V</span>
    </button>
  )
}

export const Stage = ({ project }: { project: ProjectState }) => {
  const embed = useStore((s) => s.embed)
  return (
    <section className="stage">
      <div className="stage-canvas">
        <Viewport project={project} />
      </div>
      {embed ? (
        <EmbedExit />
      ) : (
        <>
          <Toolbar process={project.profile.process} />
          <ViewCube />
        </>
      )}
      <Diagnostics project={project} />
      <ToolHint />
      {!embed && <TitleBlock project={project} />}
      {!embed && <AnalysisLegend project={project} />}
      <Console project={project} />
      {!embed && <ExportToast />}
      {!embed && <Timeline project={project} />}
    </section>
  )
}
