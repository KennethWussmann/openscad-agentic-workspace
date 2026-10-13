import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  type BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Plane,
} from 'three'
import type { Display } from '../../store/store.ts'
import type { PartMeshData } from '../pick/pick.ts'
import type { ModelMesh } from './loader.ts'

type MeshProps = {
  mesh: ModelMesh
  color: Color
  display: Display
  clip: Plane[]
  ghost?: boolean
  heat?: BufferGeometry
  data?: PartMeshData
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

const WHITE = new Color('#ffffff')

export const PartMesh = ({ mesh, color, display, clip, ghost, heat, data, onClick }: MeshProps) => {
  const painted = Boolean(heat)
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
      color: painted ? WHITE : color,
      vertexColors: painted,
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
  }, [ghost, color, painted, display.wireframe, display.xray, clip.length])
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
      <mesh
        geometry={heat ?? mesh.geometry}
        material={material}
        renderOrder={ghost ? 5 : 3}
        userData={data ?? {}}
        onClick={onClick}
      />
      {showEdges && <lineSegments geometry={mesh.edges} material={lines} renderOrder={ghost ? 6 : 4} />}
    </group>
  )
}
