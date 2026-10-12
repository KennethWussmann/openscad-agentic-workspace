import { Html, Line } from '@react-three/drei'
import type { Vec3 } from '@scad/core/protocol'
import { useMemo } from 'react'
import { type Box3, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import type { Measurement } from '../store.ts'

const gridSteps = (extent: number) => (extent <= 80 ? [1, 10] : extent <= 400 ? [5, 50] : [10, 100])

type Rect = { x0: number; x1: number; y0: number; y1: number }

const lines = (rect: Rect, step: number, skip: number) => {
  const pts: number[] = []
  const onSkip = (v: number) => skip > 0 && Math.abs(v / skip - Math.round(v / skip)) < 1e-6
  for (let x = Math.ceil(rect.x0 / step) * step; x <= rect.x1 + 1e-6; x += step)
    if (!onSkip(x)) pts.push(x, rect.y0, 0, x, rect.y1, 0)
  for (let y = Math.ceil(rect.y0 / step) * step; y <= rect.y1 + 1e-6; y += step)
    if (!onSkip(y)) pts.push(rect.x0, y, 0, rect.x1, y, 0)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts, 3))
  return g
}

export const fitsBed = (size: Vector3, bed: Vec3) =>
  size.z <= bed[2] + 1e-6 &&
  ((size.x <= bed[0] + 1e-6 && size.y <= bed[1] + 1e-6) || (size.y <= bed[0] + 1e-6 && size.x <= bed[1] + 1e-6))

type BuildPlateProps = { bed: Vec3; printer: string; box: Box3; extent: number }

export const BuildPlate = ({ bed, printer, box, extent }: BuildPlateProps) => {
  const [minor, major] = gridSteps(Math.max(60, extent * 1.6))
  const empty = box.isEmpty()
  const cx = empty ? 0 : (box.min.x + box.max.x) / 2
  const cy = empty ? 0 : (box.min.y + box.max.y) / 2
  const fits = empty || fitsBed(box.getSize(new Vector3()), bed)
  const [bx, by, bz] = bed
  const rect = useMemo(() => ({ x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2 }), [cx, cy, bx, by])
  const minorGeo = useMemo(() => lines(rect, minor, major), [rect, minor, major])
  const majorGeo = useMemo(() => lines(rect, major, 0), [rect, major])
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

export const fmt = (n: number) => {
  const a = Math.abs(n)
  return a >= 1000 ? n.toFixed(0) : a >= 100 ? n.toFixed(1) : n.toFixed(2)
}

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

const v = (p: [number, number, number]) => new Vector3(...p)

export const Measurements = ({
  measures,
  pending,
}: {
  measures: Measurement[]
  pending: [number, number, number] | null
}) => (
  <group>
    {measures.map((m) => {
      const a = v(m.a)
      const b = v(m.b)
      const d = b.clone().sub(a)
      const mid = a.clone().add(b).multiplyScalar(0.5)
      return (
        <group key={m.id}>
          <Line points={[m.a, m.b]} color="#f2a541" lineWidth={2} depthTest={false} renderOrder={10} />
          <Html position={m.a} center className="measure-dot" />
          <Html position={m.b} center className="measure-dot" />
          <Html position={mid.toArray()} center className="measure-tag">
            <strong>{fmt(d.length())} mm</strong>
            <em>
              dx {fmt(d.x)} dy {fmt(d.y)} dz {fmt(d.z)}
            </em>
          </Html>
        </group>
      )
    })}
    {pending && <Html position={pending} center className="measure-dot pending" />}
  </group>
)
