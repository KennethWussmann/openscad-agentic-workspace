import { round } from '@scad/geometry'
import type { ViewCamera, ViewSection } from '@scad/protocol'
import { Vector3 } from 'three'
import { toVec3 } from '../../lib/vec.ts'
import type { SectionState } from '../../store/store.ts'
import { rig } from '../camera/rig.ts'
import { sectionPlane } from '../section/plane.ts'
import { stage } from './CaptureBridge.tsx'

export const cameraState = (ortho: boolean): ViewCamera => {
  const c = rig.controls
  const position = c ? c.getPosition(new Vector3()) : new Vector3()
  const target = c ? c.getTarget(new Vector3()) : new Vector3()
  const up = stage.camera ? stage.camera.up.clone() : new Vector3(0, 0, 1)
  return {
    position: toVec3(position),
    target: toVec3(target),
    up: toVec3(up),
    projection: ortho ? 'orthographic' : 'perspective',
  }
}

export const sectionState = (section: SectionState): ViewSection | null =>
  section.enabled
    ? { axis: section.axis, normal: toVec3(sectionPlane.normal), constant: round(sectionPlane.constant) }
    : null
