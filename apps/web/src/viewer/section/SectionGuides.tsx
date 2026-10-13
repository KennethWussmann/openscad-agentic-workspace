import { Line, TransformControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, type Group, Vector3 } from 'three'
import { useStore } from '../../store/store.ts'
import { freeHandle, sectionPlane } from './plane.ts'

const AMBER = '#f2a541'

export const SectionOutline = ({ extent }: { extent: number }) => {
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
        color={AMBER}
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

export const FreeGizmo = ({ extent }: { extent: number }) => {
  const mode = useStore((s) => s.section.gizmo)
  return (
    <>
      <primitive object={freeHandle}>
        <mesh raycast={() => null}>
          <planeGeometry args={[extent * 1.4, extent * 1.4]} />
          <meshBasicMaterial color={AMBER} transparent opacity={0.06} depthWrite={false} side={DoubleSide} />
        </mesh>
      </primitive>
      <TransformControls object={freeHandle} mode={mode} size={0.75} />
    </>
  )
}

export const SectionGuides = ({ extent }: { extent: number }) => {
  const section = useStore((s) => s.section)
  if (!section.enabled) return null
  return section.axis === 'free' ? <FreeGizmo extent={extent} /> : <SectionOutline extent={extent} />
}
