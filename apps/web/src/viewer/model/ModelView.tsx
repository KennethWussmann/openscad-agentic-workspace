import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
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
  onPick?: (e: ThreeEvent<MouseEvent>) => void
}

export const ModelView = ({ models, ghosts, order, visible, extent, heat, onPick }: ModelViewProps) => {
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
            {model.meshes.map((mesh, n) => (
              <PartMesh
                key={mesh.id}
                mesh={mesh}
                color={partColor(mesh, index, display.modelColors)}
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
