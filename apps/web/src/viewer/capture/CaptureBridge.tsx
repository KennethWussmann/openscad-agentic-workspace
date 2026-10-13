import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { Camera, Scene, WebGLRenderer } from 'three'

export const stage = { gl: null as WebGLRenderer | null, scene: null as Scene | null, camera: null as Camera | null }

export const CaptureBridge = () => {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    stage.gl = gl
    stage.scene = scene
    stage.camera = camera
    return () => {
      stage.gl = null
      stage.scene = null
      stage.camera = null
    }
  }, [gl, scene, camera])
  return null
}
