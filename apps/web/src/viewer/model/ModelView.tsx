import { type ThreeEvent, useFrame } from '@react-three/fiber'
import type { Vec3 } from '@scad/protocol'
import { useMemo } from 'react'
import { type Box3 as Box3Type, BufferAttribute, BufferGeometry } from 'three'
import { useStore } from '../../store/store.ts'
import type { Heat } from '../analysis/heat.ts'
import { sectionPlane, updateSectionPlane } from '../section/plane.ts'
import type { LoadedModel } from './loader.ts'
import { partColor } from './materials.ts'
import { PartMesh } from './PartMesh.tsx'
import { SectionCap, StencilPair } from './SectionCap.tsx'

export type ModelViewProps = {
  models: Record<string, LoadedModel>
  ghosts: Record<string, LoadedModel>
  order: string[]
  visible: string[]
  extent: number
  heat?: Heat
  offsets?: Record<string, Vec3>
  highlight?: string | null
  sourceColors?: boolean
  onPick?: (e: ThreeEvent<MouseEvent>) => void
}

const highlightGeometry = (box: Box3Type) => {
  const [x0, y0, z0] = box.min.toArray()
  const [x1, y1, z1] = box.max.toArray()
  const corners = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ]
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  const positions = edges.flatMap(([a, b]) => [...corners[a], ...corners[b]])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}

export const ModelView = ({
  models,
  ghosts,
  order,
  visible,
  extent,
  heat,
  offsets,
  highlight,
  sourceColors = false,
  onPick,
}: ModelViewProps) => {
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
        const offset = offsets?.[id]
        return (
          <group key={`${id}:${model.key}`} name={`part:${id}`} position={offset ? [...offset] : [0, 0, 0]}>
            {model.meshes.map((mesh, n) => (
              <PartMesh
                key={mesh.id}
                mesh={mesh}
                color={partColor(mesh, index, display.modelColors || sourceColors)}
                display={display}
                clip={clip}
                heat={heat?.[mesh.id]}
                data={{
                  partId: id,
                  mesh: n,
                  color: mesh.isDefaultColor ? 'default' : `#${mesh.color.getHexString()}`,
                }}
                onClick={onPick}
              />
            ))}
            {caps && model.meshes.map((mesh) => <StencilPair key={`s${mesh.id}`} mesh={mesh} />)}
            {highlight === id && (
              <lineSegments geometry={highlightGeometry(model.box)} renderOrder={7}>
                <lineBasicMaterial color="#f2a541" depthTest={false} transparent opacity={0.9} />
              </lineSegments>
            )}
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
