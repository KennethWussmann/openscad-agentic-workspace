import { CameraControls, Line, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import type { ProjectState, RenderResult } from '@scad/core/protocol'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Box3,
  type BufferGeometry,
  type DirectionalLight,
  DoubleSide,
  type Group,
  type Mesh,
  Vector2,
  Vector3,
} from 'three'
import { fileUrl } from '../api.ts'
import { useStore } from '../store.ts'
import { BuildPlate, Dimensions, Measurements } from './Helpers.tsx'
import { ModelView } from './ModelView.tsx'
import { type ModelRequest, useModels } from './models.ts'
import { applyPose, FOV, fit, ISO, rig, viewDirection } from './rig.ts'
import { axisIndex, freeHandle, sectionPlane } from './section.ts'

export type ModelSource = {
  kind: 'working' | 'tweak' | 'version'
  stamp: string
  parts: { id: string; model: string | null }[]
}

export const modelSource = (project: ProjectState, versionId: string | null, tweaking: boolean): ModelSource | null => {
  if (versionId) {
    const v = project.versions.find((x) => x.id === versionId)
    return v ? { kind: 'version', stamp: v.id, parts: v.parts } : null
  }
  const pick = (kind: ModelSource['kind'], r: RenderResult): ModelSource => ({
    kind,
    stamp: r.finishedAt,
    parts: r.parts.map((p) => ({ id: p.id, model: p.model })),
  })
  if (tweaking && project.tweak?.parts.some((p) => p.model)) return pick('tweak', project.tweak)
  return project.render ? pick('working', project.render) : null
}

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

const SNAP_PX = 10

const pickPoint = (e: ThreeEvent<MouseEvent>, sectionOn: boolean): Vector3 | null => {
  const hit = e.intersections.find(
    (i) => (i.object as Mesh).isMesh && (!sectionOn || sectionPlane.distanceToPoint(i.point) >= -1e-4),
  )
  if (!hit) return null
  const point = hit.point.clone()
  if (!hit.face) return point
  const geo = (hit.object as Mesh).geometry as BufferGeometry
  const pos = geo.getAttribute('position')
  const { width, height } = (e.nativeEvent.target as HTMLElement).getBoundingClientRect()
  const pointer = new Vector2(e.pointer.x, e.pointer.y)
  let best: Vector3 | null = null
  let bestDist = SNAP_PX
  for (const idx of [hit.face.a, hit.face.b, hit.face.c]) {
    const vtx = new Vector3().fromBufferAttribute(pos, idx).applyMatrix4(hit.object.matrixWorld)
    const ndc = vtx.clone().project(e.camera)
    const dx = ((ndc.x - pointer.x) * width) / 2
    const dy = ((ndc.y - pointer.y) * height) / 2
    const d = Math.hypot(dx, dy)
    if (d < bestDist) {
      bestDist = d
      best = vtx
    }
  }
  return best ?? point
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
      if (tool !== 'measure' || e.delta > 4) return
      e.stopPropagation()
      const p = pickPoint(e, section.enabled)
      if (p) addPoint(p.toArray() as [number, number, number])
    },
    [tool, section.enabled, addPoint],
  )

  return (
    <Canvas
      className={`viewport-canvas tool-${tool}`}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, stencil: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
      }}
    >
      <CameraRig />
      {display.grid && <BuildPlate extent={extent} />}
      <ModelView models={models} ghosts={ghosts} order={order} visible={visible} extent={extent} onPick={onPick} />
      {display.dims && <Dimensions box={box} />}
      {section.enabled && section.axis !== 'free' && <SectionOutline extent={extent} />}
      {section.enabled && section.axis === 'free' && <FreeGizmo extent={extent} />}
      <Measurements measures={measures} pending={pending} />
    </Canvas>
  )
}
