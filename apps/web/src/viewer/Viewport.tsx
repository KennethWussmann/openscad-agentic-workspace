import { CameraControls, Line, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import type { ProjectState } from '@scad/core/protocol'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box3, type DirectionalLight, DoubleSide, type Group, Vector3 } from 'three'
import { fileUrl } from '../api.ts'
import { useStore } from '../store.ts'
import { useAnalysis } from './analysis.ts'
import { CaptureBridge } from './capture.tsx'
import { BuildPlate, Dimensions, Measurements } from './Helpers.tsx'
import { ModelView } from './ModelView.tsx'
import { type ModelRequest, useModels } from './models.ts'
import { Notes } from './Notes.tsx'
import { pickNote, pickPoint } from './pick.ts'
import { applyPose, FOV, fit, ISO, rig, viewDirection } from './rig.ts'
import { axisIndex, freeHandle, sectionPlane } from './section.ts'
import { annotationSource, type ModelSource, modelSource } from './source.ts'

const requestsFor = (project: string, source: ModelSource | null, prefix = ''): ModelRequest[] =>
  source
    ? source.parts
        .filter((p): p is { id: string; model: string } => Boolean(p.model))
        .map((p) => ({
          key: `${prefix}${project}/${p.model}@${source.stamp}`,
          partId: p.id,
          url: fileUrl(project, p.model, source.stamp),
        }))
    : []

const CameraRig = () => {
  const ortho = useStore((s) => s.display.ortho)
  const size = useThree((s) => s.size)
  rig.viewHeight = size.height
  const light = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Vector3(), [])
  useFrame(({ camera }) => {
    rig.orientation.copy(camera.quaternion)
    if (light.current && rig.controls) {
      light.current.position.copy(camera.position)
      rig.controls.getTarget(target)
      light.current.target.position.copy(target)
      light.current.target.updateMatrixWorld()
    }
  })
  const attach = useCallback((c: CameraControls | null) => {
    rig.controls = c
    if (c && !applyPose(c)) viewDirection(ISO, false)
  }, [])
  return (
    <>
      {ortho ? (
        <OrthographicCamera makeDefault near={-100000} far={100000} position={[300, -300, 240]} up={[0, 0, 1]} />
      ) : (
        <PerspectiveCamera makeDefault fov={FOV} near={0.1} far={200000} position={[300, -300, 240]} up={[0, 0, 1]} />
      )}
      <CameraControls
        key={ortho ? 'ortho' : 'persp'}
        ref={attach}
        makeDefault
        smoothTime={0.18}
        draggingSmoothTime={0.06}
        dollyToCursor
        infinityDolly={false}
        minDistance={0.5}
      />
      <hemisphereLight args={['#dfe8f2', '#1a2129', 1.1]} />
      <ambientLight intensity={0.25} />
      <directionalLight ref={light} intensity={1.6} />
      <directionalLight position={[-200, 300, 500]} intensity={0.35} />
    </>
  )
}

const SectionOutline = ({ extent }: { extent: number }) => {
  const ref = useRef<Group>(null)
  const point = useMemo(() => new Vector3(), [])
  const look = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    sectionPlane.coplanarPoint(point)
    g.position.copy(point)
    g.lookAt(look.copy(point).sub(sectionPlane.normal))
  })
  const h = extent * 0.75
  return (
    <group ref={ref}>
      <Line
        points={[
          [-h, -h, 0],
          [h, -h, 0],
          [h, h, 0],
          [-h, h, 0],
          [-h, -h, 0],
        ]}
        color="#f2a541"
        lineWidth={1}
        dashed
        dashSize={3}
        gapSize={2}
        transparent
        opacity={0.6}
      />
    </group>
  )
}

const FreeGizmo = ({ extent }: { extent: number }) => {
  const mode = useStore((s) => s.section.gizmo)
  return (
    <>
      <primitive object={freeHandle}>
        <mesh raycast={() => null}>
          <planeGeometry args={[extent * 1.4, extent * 1.4]} />
          <meshBasicMaterial color="#f2a541" transparent opacity={0.06} depthWrite={false} side={DoubleSide} />
        </mesh>
      </primitive>
      <TransformControls object={freeHandle} mode={mode} size={0.75} />
    </>
  )
}

export type ViewportProps = { project: ProjectState }

export const Viewport = ({ project }: ViewportProps) => {
  const versionId = useStore((s) => s.versionId)
  const ghostId = useStore((s) => s.ghostId)
  const edits = useStore((s) => s.edits)
  const hidden = useStore((s) => s.hidden)
  const solo = useStore((s) => s.solo)
  const display = useStore((s) => s.display)
  const section = useStore((s) => s.section)
  const tool = useStore((s) => s.tool)
  const measures = useStore((s) => s.measures)
  const pending = useStore((s) => s.pending)
  const fitToken = useStore((s) => s.fitToken)
  const addPoint = useStore((s) => s.addPoint)
  const addNote = useStore((s) => s.addNote)
  const closeEditor = useStore((s) => s.closeEditor)
  const embed = useStore((s) => s.embed)
  const setSection = useStore((s) => s.setSection)

  const tweaking = Object.keys(edits).length > 0
  const source = modelSource(project, versionId, tweaking)
  const ghostSource = ghostId ? modelSource(project, ghostId, false) : null
  const { models } = useModels(requestsFor(project.id, source))
  const { models: ghosts } = useModels(requestsFor(project.id, ghostSource, 'ghost:'))

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
  const setBounds = useStore((s) => s.setBounds)
  useEffect(() => {
    setBounds(box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()])
  }, [box, setBounds])

  const profileKey = JSON.stringify(project.profile)
  const profile = useMemo(() => JSON.parse(profileKey) as ProjectState['profile'], [profileKey])
  const mode = display.overhangs ? 'overhangs' : display.walls ? 'walls' : null
  const analysis = useAnalysis(models, visible, profile, mode)
  const setAnalysis = useStore((s) => s.setAnalysis)
  useEffect(() => setAnalysis(analysis?.summary ?? null), [analysis, setAnalysis])

  const fitted = useRef(0)
  const loaded = Object.keys(models).length > 0
  useEffect(() => {
    if (!loaded || fitted.current === fitToken) return
    fitted.current = fitToken
    const id = setTimeout(() => fit(fitToken > 1), 30)
    return () => clearTimeout(id)
  }, [fitToken, loaded])

  const lastAxis = useRef(section.axis)
  useEffect(() => {
    if (section.axis === 'free' && lastAxis.current !== 'free' && !box.isEmpty()) {
      const center = box.getCenter(new Vector3())
      const prev = lastAxis.current
      center.setComponent(axisIndex(prev), section.offset)
      freeHandle.position.copy(center)
      freeHandle.rotation.set(prev === 'y' ? -Math.PI / 2 : 0, prev === 'x' ? Math.PI / 2 : 0, 0)
    }
    lastAxis.current = section.axis
  }, [section.axis, section.offset, box])

  useEffect(() => {
    if (!section.enabled || section.axis === 'free' || box.isEmpty()) return
    const i = axisIndex(section.axis)
    const lo = box.min.getComponent(i)
    const hi = box.max.getComponent(i)
    if (section.offset < lo - 1 || section.offset > hi + 1) setSection({ offset: (lo + hi) / 2 })
  }, [section.enabled, section.axis, section.offset, box, setSection])

  const onPick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (tool === 'orbit' || e.delta > 4 || (tool === 'annotate' && embed)) return
      e.stopPropagation()
      if (tool === 'measure') {
        const p = pickPoint(e, section.enabled)
        if (p) addPoint(p.toArray() as [number, number, number])
        return
      }
      const note = pickNote(e, section.enabled, project.parts, annotationSource(project, versionId, edits))
      if (note) addNote(note)
    },
    [tool, embed, section.enabled, addPoint, addNote, project, versionId, edits],
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
      {section.enabled && section.axis !== 'free' && <SectionOutline extent={extent} />}
      {section.enabled && section.axis === 'free' && <FreeGizmo extent={extent} />}
      <Measurements measures={measures} pending={pending} />
      {!embed && <Notes extent={extent} sent={project.proposals.annotations?.annotations ?? []} />}
    </Canvas>
  )
}
