import { Html, Line } from '@react-three/drei'
import type { Vec3 } from '@scad/protocol'
import { useMemo } from 'react'
import { type Box3, Vector3 } from 'three'
import { fmt } from '../../lib/format.ts'
import { fitsBed, gridLines, gridSteps } from './bed.ts'

type BuildPlateProps = { bed: Vec3; printer: string; box: Box3; extent: number }

export const BuildPlate = ({ bed, printer, box, extent }: BuildPlateProps) => {
  const [minor, major] = gridSteps(Math.max(60, extent * 1.6))
  const empty = box.isEmpty()
  const cx = empty ? 0 : (box.min.x + box.max.x) / 2
  const cy = empty ? 0 : (box.min.y + box.max.y) / 2
  const fits = empty || fitsBed(box.getSize(new Vector3()), bed)
  const [bx, by, bz] = bed
  const rect = useMemo(() => ({ x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2 }), [cx, cy, bx, by])
  const minorGeo = useMemo(() => gridLines(rect, minor, major), [rect, minor, major])
  const majorGeo = useMemo(() => gridLines(rect, major, 0), [rect, major])
  const corners = (z: number): [number, number, number][] => [
    [rect.x0, rect.y0, z],
    [rect.x1, rect.y0, z],
    [rect.x1, rect.y1, z],
    [rect.x0, rect.y1, z],
    [rect.x0, rect.y0, z],
  ]
  const volume: [number, number, number][] = [
    ...corners(bz)
      .slice(0, 4)
      .flatMap((c, i, all) => [c, all[(i + 1) % 4]]),
    ...corners(0)
      .slice(0, 4)
      .flatMap(([x, y]) => [[x, y, 0] as [number, number, number], [x, y, bz] as [number, number, number]]),
  ]
  const outline = fits ? '#3b556c' : '#ff3b30'
  const axis = Math.max(10, extent * 0.8)
  return (
    <group renderOrder={0}>
      <lineSegments geometry={minorGeo}>
        <lineBasicMaterial color="#1a2633" transparent opacity={0.7} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={majorGeo}>
        <lineBasicMaterial color="#26394b" transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
      <Line points={corners(0)} color={outline} lineWidth={1.5} transparent opacity={0.9} />
      <Line
        points={volume}
        segments
        color={outline}
        lineWidth={1}
        dashed
        dashSize={4}
        gapSize={3}
        transparent
        opacity={fits ? 0.25 : 0.6}
      />
      <Html position={[rect.x0, rect.y0, 0]} className={`bed-tag${fits ? '' : ' is-over'}`}>
        {printer} {fmt(bx)} x {fmt(by)} x {fmt(bz)}
      </Html>
      <Line
        points={[
          [0, 0, 0],
          [axis, 0, 0],
        ]}
        color="#e0645a"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Line
        points={[
          [0, 0, 0],
          [0, axis, 0],
        ]}
        color="#7fcf7a"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Line
        points={[
          [0, 0, 0],
          [0, 0, axis / 3],
        ]}
        color="#5a9ae0"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Html position={[axis, 0, 0]} center className="axis-tag axis-x">
        X
      </Html>
      <Html position={[0, axis, 0]} center className="axis-tag axis-y">
        Y
      </Html>
    </group>
  )
}
