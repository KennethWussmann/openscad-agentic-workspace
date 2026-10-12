import { Object3D, Plane, Vector3 } from 'three'
import type { SectionState } from '../store.ts'

export const sectionPlane = new Plane(new Vector3(-1, 0, 0), 0)
export const freeHandle = new Object3D()

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

const tmpNormal = new Vector3()

export const updateSectionPlane = (section: SectionState) => {
  if (section.axis === 'free') {
    freeHandle.updateMatrixWorld(true)
    tmpNormal.set(0, 0, -1).applyQuaternion(freeHandle.quaternion).normalize()
    sectionPlane.setFromNormalAndCoplanarPoint(tmpNormal, freeHandle.position)
  } else {
    const axis = AXES[section.axis]
    sectionPlane.normal.copy(axis).multiplyScalar(-1)
    sectionPlane.constant = section.offset
  }
  if (section.flip) sectionPlane.negate()
  return sectionPlane
}

export const axisIndex = (axis: 'x' | 'y' | 'z') => ({ x: 0, y: 1, z: 2 })[axis]
