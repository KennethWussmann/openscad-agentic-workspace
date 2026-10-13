import { Canvas, type ThreeEvent } from '@react-three/fiber'
import type { PrintProfile, ProjectState } from '@scad/protocol'
import { useCallback, useEffect, useMemo } from 'react'
import { Box3, Vector3 } from 'three'
import { useStore } from '../store/store.ts'
import { useAnalysis } from './analysis/useAnalysis.ts'
import { CameraRig } from './camera/CameraRig.tsx'
import { rig } from './camera/rig.ts'
import { useAutoFit } from './camera/useAutoFit.ts'
import { CaptureBridge } from './capture/CaptureBridge.tsx'
import { BuildPlate } from './guides/BuildPlate.tsx'
import { Dimensions } from './guides/Dimensions.tsx'
import { Measurements } from './guides/Measurements.tsx'
import { useModels } from './model/loader.ts'
import { ModelView } from './model/ModelView.tsx'
import { modelRequests } from './model/requests.ts'
import { annotationSource, modelSource } from './model/source.ts'
import { Notes } from './notes/Notes.tsx'
import { pickNote, pickPoint } from './pick/pick.ts'
import { SectionGuides } from './section/SectionGuides.tsx'
import { useSectionSync } from './section/useSectionSync.ts'

export const Viewport = ({ project }: { project: ProjectState }) => {
  const versionId = useStore((s) => s.versionId)
  const ghostId = useStore((s) => s.ghostId)
  const edits = useStore((s) => s.edits)
  const hidden = useStore((s) => s.hidden)
  const solo = useStore((s) => s.solo)
  const display = useStore((s) => s.display)
  const sectionOn = useStore((s) => s.section.enabled)
  const tool = useStore((s) => s.tool)
  const measures = useStore((s) => s.measures)
  const pending = useStore((s) => s.pending)
  const addPoint = useStore((s) => s.addPoint)
  const addNote = useStore((s) => s.addNote)
  const closeEditor = useStore((s) => s.closeEditor)
  const embed = useStore((s) => s.embed)
  const setBounds = useStore((s) => s.setBounds)
  const setAnalysis = useStore((s) => s.setAnalysis)

  const source = modelSource(project, versionId, Object.keys(edits).length > 0)
  const ghostSource = ghostId ? modelSource(project, ghostId, false) : null
  const { models } = useModels(modelRequests(project.id, source))
  const { models: ghosts } = useModels(modelRequests(project.id, ghostSource, 'ghost:'))

  const order = useMemo(() => project.parts.filter((p) => p.preview).map((p) => p.id), [project.parts])
  const visible = useMemo(
    () => order.filter((id) => (solo ? id === solo : !hidden.includes(id))),
    [order, hidden, solo],
  )
  const box = useMemo(() => {
    const b = new Box3()
    for (const id of visible) if (models[id]) b.union(models[id].box)
    return b
  }, [models, visible])
  const extent = box.isEmpty() ? 100 : Math.max(...box.getSize(new Vector3()).toArray(), 10)
  rig.box.copy(box)
  useEffect(() => {
    setBounds(box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()])
  }, [box, setBounds])

  const profileKey = JSON.stringify(project.profile)
  const profile = useMemo(() => JSON.parse(profileKey) as PrintProfile, [profileKey])
  const mode = display.overhangs ? 'overhangs' : display.walls ? 'walls' : null
  const analysis = useAnalysis(models, visible, profile, mode)
  useEffect(() => setAnalysis(analysis?.summary ?? null), [analysis, setAnalysis])

  useAutoFit(Object.keys(models).length > 0)
  useSectionSync(box)

  const onPick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (tool === 'orbit' || e.delta > 4 || (tool === 'annotate' && embed)) return
      e.stopPropagation()
      if (tool === 'measure') {
        const p = pickPoint(e, sectionOn)
        if (p) addPoint(p.toArray())
        return
      }
      const note = pickNote(e, sectionOn, project.parts, annotationSource(project, versionId, edits))
      if (note) addNote(note)
    },
    [tool, embed, sectionOn, addPoint, addNote, project, versionId, edits],
  )

  return (
    <Canvas
      className={`viewport-canvas tool-${tool}`}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, stencil: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
      }}
      onPointerMissed={(e) => {
        if (e.type === 'click') closeEditor()
      }}
    >
      <CameraRig />
      <CaptureBridge />
      {display.grid && <BuildPlate bed={profile.bed} printer={profile.printer} box={box} extent={extent} />}
      <ModelView
        models={models}
        ghosts={ghosts}
        order={order}
        visible={visible}
        extent={extent}
        heat={analysis?.heat}
        onPick={onPick}
      />
      {display.dims && <Dimensions box={box} bed={profile.bed} />}
      <SectionGuides extent={extent} />
      <Measurements measures={measures} pending={pending} />
      {!embed && <Notes extent={extent} sent={project.proposals.annotations?.annotations ?? []} />}
    </Canvas>
  )
}
