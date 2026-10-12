import type { CameraControls } from '@react-three/drei'
import { Box3, MathUtils, type OrthographicCamera, Quaternion, Sphere, Vector3 } from 'three'

export const FOV = 35

type Pose = { target: Vector3; direction: Vector3; distance: number }

export const rig = {
  controls: null as CameraControls | null,
  box: new Box3(),
  pose: null as Pose | null,
  orientation: new Quaternion(),
  viewHeight: 800,
}

const isOrtho = (c: CameraControls) => (c.camera as OrthographicCamera).isOrthographicCamera === true

const visibleDistance = (c: CameraControls) => {
  if (!isOrtho(c)) return c.distance
  const zoom = (c.camera as OrthographicCamera).zoom
  return rig.viewHeight / (2 * zoom * Math.tan(MathUtils.degToRad(FOV / 2)))
}

export const savePose = () => {
  const c = rig.controls
  if (!c) return
  const target = c.getTarget(new Vector3())
  const position = c.getPosition(new Vector3())
  rig.pose = { target, direction: position.sub(target).normalize(), distance: visibleDistance(c) }
}

export const applyPose = (c: CameraControls) => {
  const pose = rig.pose
  if (!pose) return false
  if (isOrtho(c)) {
    const cam = c.camera as OrthographicCamera
    const position = pose.target.clone().addScaledVector(pose.direction, Math.max(pose.distance, boxRadius() * 4, 500))
    c.setLookAt(position.x, position.y, position.z, pose.target.x, pose.target.y, pose.target.z, false)
    const zoom = rig.viewHeight / (2 * pose.distance * Math.tan(MathUtils.degToRad(FOV / 2)))
    cam.zoom = zoom
    cam.updateProjectionMatrix()
    c.zoomTo(zoom, false)
  } else {
    const position = pose.target.clone().addScaledVector(pose.direction, pose.distance)
    c.setLookAt(position.x, position.y, position.z, pose.target.x, pose.target.y, pose.target.z, false)
  }
  return true
}

const boxRadius = () => (rig.box.isEmpty() ? 50 : rig.box.getBoundingSphere(new Sphere()).radius)

const fitDistance = () => (boxRadius() / Math.sin(MathUtils.degToRad(FOV / 2))) * 1.15

export const viewDirection = (dir: Vector3, animate = true) => {
  const c = rig.controls
  if (!c) return
  const n = dir.clone().normalize()
  const target = rig.box.isEmpty() ? new Vector3() : rig.box.getCenter(new Vector3())
  if (isOrtho(c)) {
    const far = Math.max(boxRadius() * 4, 500)
    const p = target.clone().addScaledVector(n, far)
    c.setLookAt(p.x, p.y, p.z, target.x, target.y, target.z, animate)
    c.zoomTo(rig.viewHeight / (2 * fitDistance() * Math.tan(MathUtils.degToRad(FOV / 2))), animate)
  } else {
    const p = target.clone().addScaledVector(n, fitDistance())
    c.setLookAt(p.x, p.y, p.z, target.x, target.y, target.z, animate)
  }
}

export const ISO = new Vector3(1, -1, 0.8)

export const VIEWS: Record<string, Vector3> = {
  iso: ISO,
  front: new Vector3(0, -1, 0),
  back: new Vector3(0, 1, 0),
  right: new Vector3(1, 0, 0),
  left: new Vector3(-1, 0, 0),
  top: new Vector3(0, 0, 1),
  bottom: new Vector3(0, 0, -1),
}

export const fit = (animate = true) => {
  const c = rig.controls
  if (!c) return
  const position = c.getPosition(new Vector3())
  const target = c.getTarget(new Vector3())
  const dir = position.sub(target)
  viewDirection(dir.lengthSq() > 0 ? dir : ISO, animate)
}
