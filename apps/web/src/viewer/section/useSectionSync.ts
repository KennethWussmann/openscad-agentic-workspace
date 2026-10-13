import { useEffect, useRef } from 'react'
import { type Box3, Vector3 } from 'three'
import { useStore } from '../../store/store.ts'
import { axisIndex, freeHandle } from './plane.ts'

export const useSectionSync = (box: Box3) => {
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)

  const lastAxis = useRef(section.axis)
  useEffect(() => {
    if (section.axis === 'free' && lastAxis.current !== 'free' && !box.isEmpty()) {
      const center = box.getCenter(new Vector3())
      const prev = lastAxis.current
      center.setComponent(axisIndex(prev), section.offset)
      freeHandle.position.copy(center)
      freeHandle.rotation.set(prev === 'y' ? -Math.PI / 2 : 0, prev === 'x' ? Math.PI / 2 : 0, 0)
    }
    lastAxis.current = section.axis
  }, [section.axis, section.offset, box])

  useEffect(() => {
    if (!section.enabled || section.axis === 'free' || box.isEmpty()) return
    const i = axisIndex(section.axis)
    const lo = box.min.getComponent(i)
    const hi = box.max.getComponent(i)
    if (section.offset < lo - 1 || section.offset > hi + 1) setSection({ offset: (lo + hi) / 2 })
  }, [section.enabled, section.axis, section.offset, box, setSection])
}
