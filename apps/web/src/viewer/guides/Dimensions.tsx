import { Html, Line } from '@react-three/drei'
import type { Vec3 } from '@scad/protocol'
import { type Box3, Vector3 } from 'three'
import { fmt } from '../../lib/format.ts'
import { fitsBed } from './bed.ts'

export const Dimensions = ({ box, bed }: { box: Box3; bed: Vec3 }) => {
  if (box.isEmpty()) return null
  const { min, max } = box
  const size = box.getSize(new Vector3())
  const fits = fitsBed(size, bed)
  const over = (i: number) => (!fits && size.getComponent(i) > bed[i] + 1e-6 ? ' is-over' : '')
  const off = Math.max(size.x, size.y, size.z) * 0.06 + 1
  const x0: [number, number, number] = [min.x, min.y - off, min.z]
  const x1: [number, number, number] = [max.x, min.y - off, min.z]
  const y0: [number, number, number] = [max.x + off, min.y, min.z]
  const y1: [number, number, number] = [max.x + off, max.y, min.z]
  const z0: [number, number, number] = [max.x + off, min.y - off, min.z]
  const z1: [number, number, number] = [max.x + off, min.y - off, max.z]
  const corners = [
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [max.x, max.y, min.z],
    [min.x, max.y, min.z],
    [min.x, min.y, max.z],
    [max.x, min.y, max.z],
    [max.x, max.y, max.z],
    [min.x, max.y, max.z],
  ] as [number, number, number][]
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  const segments = edges.flatMap(([a, b]) => [corners[a], corners[b]])
  const mid = (a: number[], b: number[]) => a.map((v, i) => (v + b[i]) / 2) as [number, number, number]
  return (
    <group>
      <Line
        points={segments}
        segments
        color="#5ad1e6"
        lineWidth={1}
        dashed
        dashSize={2}
        gapSize={1.5}
        transparent
        opacity={0.35}
      />
      <Line points={[x0, x1]} color="#5ad1e6" lineWidth={1.2} />
      <Line points={[y0, y1]} color="#5ad1e6" lineWidth={1.2} />
      <Line points={[z0, z1]} color="#5ad1e6" lineWidth={1.2} />
      <Html position={mid(x0, x1)} center className={`dim-tag${over(0)}`}>
        <span>X</span> {fmt(size.x)}
      </Html>
      <Html position={mid(y0, y1)} center className={`dim-tag${over(1)}`}>
        <span>Y</span> {fmt(size.y)}
      </Html>
      <Html position={mid(z0, z1)} center className={`dim-tag${over(2)}`}>
        <span>Z</span> {fmt(size.z)}
      </Html>
    </group>
  )
}
