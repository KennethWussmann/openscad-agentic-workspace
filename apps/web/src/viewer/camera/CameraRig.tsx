import { CameraControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useMemo, useRef } from 'react'
import { type DirectionalLight, Vector3 } from 'three'
import { useStore } from '../../store/store.ts'
import { applyPose, FOV, ISO, rig, viewDirection } from './rig.ts'

const START: [number, number, number] = [300, -300, 240]
const UP: [number, number, number] = [0, 0, 1]

export const CameraRig = () => {
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
        <OrthographicCamera makeDefault near={-100000} far={100000} position={START} up={UP} />
      ) : (
        <PerspectiveCamera makeDefault fov={FOV} near={0.1} far={200000} position={START} up={UP} />
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
