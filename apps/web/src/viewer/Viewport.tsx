import { Canvas, type ThreeEvent } from '@react-three/fiber'
import type { PrintProfile, ProjectState, Vec3 } from '@scad/protocol'
import { useCallback, useEffect, useMemo } from 'react'
import { Box3, Vector3 } from 'three'
import { useOverrides } from '../hooks/useOverrides.ts'
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
import { annotationSource, assemblySource, modelSource } from './model/source.ts'
import { Notes } from './notes/Notes.tsx'
import { pickNote, pickPoint } from './pick/pick.ts'
import { SectionGuides } from './section/SectionGuides.tsx'
import { useSectionSync } from './section/useSectionSync.ts'

const centerOf = (box: Box3) => box.getCenter(new Vector3())

export const Viewport = ({ project }: { project: ProjectState }) => {
  const versionId = useStore((s) => s.versionId)
  const ghostId = useStore((s) => s.ghostId)
  const viewMode = useStore((s) => s.viewMode)
  const selectedPart = useStore((s) => s.selectedPart)
  const selectedAssembly = useStore((s) => s.selectedAssembly)
  const assemblyHidden = useStore((s) => s.assemblyHidden)
  const explode = useStore((s) => s.explode)
  const peekPart = useStore((s) => s.peekPart)
  const setPeekPart = useStore((s) => s.setPeekPart)
  const overrides = useOverrides()
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

  const inAssembly = viewMode === 'assembly'
  const tweaking = Object.keys(overrides).length > 0
  const source = inAssembly
    ? assemblySource(project, versionId, tweaking, selectedAssembly)
    : modelSource(project, versionId, tweaking)
  const ghostSource = ghostId
    ? inAssembly
      ? assemblySource(project, ghostId, false, selectedAssembly)
      : modelSource(project, ghostId, false)
    : null
  const { models } = useModels(modelRequests(project.id, source))
  const { models: ghosts } = useModels(modelRequests(project.id, ghostSource, 'ghost:'))

  const order = useMemo(
    () =>
      inAssembly ? (source?.parts ?? []).map((p) => p.id) : project.parts.filter((p) => p.preview).map((p) => p.id),
    [inAssembly, source, project.parts],
  )
  const visible = useMemo(
    () => (inAssembly ? order.filter((id) => !assemblyHidden.includes(id)) : order.filter((id) => id === selectedPart)),
    [inAssembly, order, assemblyHidden, selectedPart],
  )
  const offsets = useMemo(() => {
    const out: Record<string, Vec3> = {}
    if (!inAssembly || explode <= 0) return out
    const union = new Box3()
    for (const id of visible) if (models[id]) union.union(models[id].box)
    if (union.isEmpty()) return out
    const center = centerOf(union)
    for (const id of visible) {
      const model = models[id]
      if (!model) continue
      const partCenter = centerOf(model.box)
      out[id] = [
        (partCenter.x - center.x) * explode,
        (partCenter.y - center.y) * explode,
        (partCenter.z - center.z) * explode,
      ]
    }
    return out
  }, [inAssembly, explode, visible, models])
  const box = useMemo(() => {
    const b = new Box3()
    for (const id of visible)
      if (models[id]) {
        const offset = offsets[id]
        b.union(offset ? models[id].box.clone().translate(new Vector3(...offset)) : models[id].box)
      }
    return b
  }, [models, visible, offsets])
  const extent = box.isEmpty() ? 100 : Math.max(...box.getSize(new Vector3()).toArray(), 10)
  rig.box.copy(box)
  useEffect(() => {
    setBounds(box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()])
  }, [box, setBounds])

  const profileKey = JSON.stringify(project.profile)
  const profile = useMemo(() => JSON.parse(profileKey) as PrintProfile, [profileKey])
  const mode = !inAssembly && display.overhangs ? 'overhangs' : !inAssembly && display.walls ? 'walls' : null
  const analysis = useAnalysis(models, visible, profile, mode)
  useEffect(() => setAnalysis(analysis?.summary ?? null), [analysis, setAnalysis])

  useAutoFit(Object.keys(models).length > 0)
  useSectionSync(box)

  const onPick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return
      e.stopPropagation()
      if (tool === 'measure') {
        const p = pickPoint(e, sectionOn)
        if (p) addPoint(p.toArray())
        return
      }
      if (inAssembly) {
        if (tool === 'orbit') {
          const hit = e.intersections.find((i) => i.object.userData.partId !== undefined)
          setPeekPart((hit?.object.userData.partId as string | undefined) ?? null)
        }
        return
      }
      if (tool !== 'orbit' && !embed) {
        const note = pickNote(e, sectionOn, project.parts, annotationSource(project, versionId, overrides))
        if (note) addNote(note)
      }
    },
    [tool, embed, sectionOn, addPoint, addNote, project, versionId, overrides, inAssembly, setPeekPart],
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
        if (e.type === 'click') {
          closeEditor()
          if (inAssembly) setPeekPart(null)
        }
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
        offsets={offsets}
        highlight={inAssembly ? peekPart : null}
        sourceColors={inAssembly}
        onPick={onPick}
      />
      {display.dims && <Dimensions box={box} bed={profile.bed} />}
      <SectionGuides extent={extent} />
      <Measurements measures={measures} pending={pending} />
      {!embed && <Notes extent={extent} sent={project.proposals.annotations?.annotations ?? []} />}
    </Canvas>
  )
}
