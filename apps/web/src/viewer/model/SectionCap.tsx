import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { type Mesh, Vector3 } from 'three'
import { sectionPlane } from '../section/plane.ts'
import type { ModelMesh } from './loader.ts'
import { backStencil, capGeometry, capMaterial, frontStencil } from './materials.ts'

export const StencilPair = ({ mesh }: { mesh: ModelMesh }) => {
  backStencil.clippingPlanes = [sectionPlane]
  frontStencil.clippingPlanes = [sectionPlane]
  return (
    <>
      <mesh geometry={mesh.geometry} material={backStencil} renderOrder={1} />
      <mesh geometry={mesh.geometry} material={frontStencil} renderOrder={1} />
    </>
  )
}

export const SectionCap = ({ size }: { size: number }) => {
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
