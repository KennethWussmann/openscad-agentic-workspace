import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AlwaysStencilFunc,
  BackSide,
  Color,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  LineBasicMaterial,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  type Plane,
  PlaneGeometry,
  ReplaceStencilOp,
  ShaderMaterial,
  Vector3,
} from 'three'
import { type Display, useStore } from '../store.ts'
import type { LoadedModel, ModelMesh } from './models.ts'
import { sectionPlane, updateSectionPlane } from './section.ts'

const PALETTE = ['#b8c4d0', '#8fb3c8', '#c8b38f', '#9fc4ae', '#c49fb4', '#a7a0cc']

export const CAP_COLORS = { fill: '#3a2a12', line: '#f2a541' }

const capMaterial = new ShaderMaterial({
  uniforms: {
    fill: { value: new Color(CAP_COLORS.fill) },
    line: { value: new Color(CAP_COLORS.line) },
    spacing: { value: 9 },
  },
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform vec3 fill;
    uniform vec3 line;
    uniform float spacing;
    void main() {
      float d = mod(gl_FragCoord.x + gl_FragCoord.y, spacing);
      float hatch = 1.0 - smoothstep(1.0, 2.2, d);
      gl_FragColor = vec4(mix(fill, line, hatch * 0.85), 1.0);
    }
  `,
  side: DoubleSide,
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: NotEqualStencilFunc,
  stencilFail: ReplaceStencilOp,
  stencilZFail: ReplaceStencilOp,
  stencilZPass: ReplaceStencilOp,
})

const stencilMaterial = (side: typeof BackSide | typeof FrontSide) =>
  new MeshBasicMaterial({
    side,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilFunc: AlwaysStencilFunc,
    stencilFail: side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp,
    stencilZFail: side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp,
    stencilZPass: side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp,
  })

const backStencil = stencilMaterial(BackSide)
const frontStencil = stencilMaterial(FrontSide)

export const partColor = (mesh: ModelMesh, index: number, modelColors: boolean) =>
  modelColors && !mesh.isDefaultColor ? mesh.color : new Color(PALETTE[index % PALETTE.length])

type MeshProps = {
  mesh: ModelMesh
  color: Color
  display: Display
  clip: Plane[]
  ghost?: boolean
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

const PartMesh = ({ mesh, color, display, clip, ghost, onClick }: MeshProps) => {
  const material = useMemo(() => {
    if (ghost)
      return new MeshBasicMaterial({
        color: '#5ad1e6',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: DoubleSide,
      })
    const m = new MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: clip.length ? DoubleSide : FrontSide,
      wireframe: display.wireframe,
    })
    if (display.xray) {
      m.transparent = true
      m.opacity = 0.16
      m.depthWrite = false
    }
    return m
  }, [ghost, color, display.wireframe, display.xray, clip.length])
  useEffect(() => () => material.dispose(), [material])
  material.clippingPlanes = clip

  const lines = useMemo(() => {
    if (ghost) return new LineBasicMaterial({ color: '#5ad1e6', transparent: true, opacity: 0.55, depthTest: false })
    if (display.xray)
      return new LineBasicMaterial({ color: '#5ad1e6', transparent: true, opacity: 0.7, depthTest: false })
    return new LineBasicMaterial({ color: '#0b1016', transparent: true, opacity: 0.55 })
  }, [ghost, display.xray])
  useEffect(() => () => lines.dispose(), [lines])
  lines.clippingPlanes = clip
  const showEdges = ghost || display.xray || (display.edges && !display.wireframe)

  return (
    <group>
      <mesh geometry={mesh.geometry} material={material} renderOrder={ghost ? 5 : 3} onClick={onClick} />
      {showEdges && <lineSegments geometry={mesh.edges} material={lines} renderOrder={ghost ? 6 : 4} />}
    </group>
  )
}

const StencilPair = ({ mesh }: { mesh: ModelMesh }) => {
  backStencil.clippingPlanes = [sectionPlane]
  frontStencil.clippingPlanes = [sectionPlane]
  return (
    <>
      <mesh geometry={mesh.geometry} material={backStencil} renderOrder={1} />
      <mesh geometry={mesh.geometry} material={frontStencil} renderOrder={1} />
    </>
  )
}

const capGeometry = new PlaneGeometry(1, 1)

const SectionCap = ({ size }: { size: number }) => {
  const ref = useRef<Mesh>(null)
  const point = useMemo(() => new Vector3(), [])
  const look = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const cap = ref.current
    if (!cap) return
    sectionPlane.coplanarPoint(point)
    cap.position.copy(point)
    cap.lookAt(look.copy(point).sub(sectionPlane.normal))
    cap.scale.setScalar(size)
  })
  return (
    <mesh
      ref={ref}
      geometry={capGeometry}
      material={capMaterial}
      renderOrder={2}
      onAfterRender={(renderer) => renderer.clearStencil()}
    />
  )
}

export type ModelViewProps = {
  models: Record<string, LoadedModel>
  ghosts: Record<string, LoadedModel>
  order: string[]
  visible: string[]
  extent: number
  onPick?: (e: ThreeEvent<MouseEvent>) => void
}

export const ModelView = ({ models, ghosts, order, visible, extent, onPick }: ModelViewProps) => {
  const display = useStore((s) => s.display)
  const section = useStore((s) => s.section)
  useFrame(() => {
    if (section.enabled) updateSectionPlane(section)
  })
  const clip = useMemo(() => (section.enabled ? [sectionPlane] : []), [section.enabled])
  const caps = section.enabled && section.caps && !display.wireframe
  const shown = order.filter((id) => visible.includes(id))

  return (
    <group>
      {shown.map((id) => {
        const model = models[id]
        if (!model) return null
        const index = order.indexOf(id)
        return (
          <group key={`${id}:${model.key}`} name={`part:${id}`}>
            {model.meshes.map((mesh) => (
              <PartMesh
                key={mesh.id}
                mesh={mesh}
                color={partColor(mesh, index, display.modelColors)}
                display={display}
                clip={clip}
                onClick={onPick}
              />
            ))}
            {caps && model.meshes.map((mesh) => <StencilPair key={`s${mesh.id}`} mesh={mesh} />)}
          </group>
        )
      })}
      {caps && <SectionCap size={extent * 3} />}
      {shown.map((id) => {
        const model = ghosts[id]
        if (!model) return null
        return (
          <group key={`ghost:${id}:${model.key}`}>
            {model.meshes.map((mesh) => (
              <PartMesh key={mesh.id} mesh={mesh} color={mesh.color} display={display} clip={clip} ghost />
            ))}
          </group>
        )
      })}
    </group>
  )
}
