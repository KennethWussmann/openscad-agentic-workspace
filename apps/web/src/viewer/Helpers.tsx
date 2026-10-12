import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { type Box3, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import type { Measurement } from '../store.ts'

const gridSteps = (extent: number) => (extent <= 80 ? [1, 10] : extent <= 400 ? [5, 50] : [10, 100])

const lines = (extent: number, step: number, skip: number) => {
  const half = Math.ceil(extent / step) * step
  const pts: number[] = []
  for (let v = -half; v <= half + 1e-6; v += step) {
    if (skip && Math.abs(v / skip - Math.round(v / skip)) < 1e-6) continue
    pts.push(v, -half, 0, v, half, 0, -half, v, 0, half, v, 0)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts, 3))
  return g
}

export const BuildPlate = ({ extent }: { extent: number }) => {
  const size = Math.max(60, extent * 1.6)
  const [minor, major] = gridSteps(size)
  const minorGeo = useMemo(() => lines(size, minor, major), [size, minor, major])
  const majorGeo = useMemo(() => lines(size, major, 0), [size, major])
  const half = Math.ceil(size / major) * major
  return (
    <group renderOrder={0}>
      <lineSegments geometry={minorGeo}>
        <lineBasicMaterial color="#1a2633" transparent opacity={0.7} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={majorGeo}>
        <lineBasicMaterial color="#26394b" transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
      <Line
        points={[
          [0, 0, 0],
          [half, 0, 0],
        ]}
        color="#e0645a"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Line
        points={[
          [0, 0, 0],
          [0, half, 0],
        ]}
        color="#7fcf7a"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Line
        points={[
          [0, 0, 0],
          [0, 0, half / 3],
        ]}
        color="#5a9ae0"
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
      <Html position={[half, 0, 0]} center className="axis-tag axis-x">
        X
      </Html>
      <Html position={[0, half, 0]} center className="axis-tag axis-y">
        Y
      </Html>
    </group>
  )
}

export const fmt = (n: number) => {
  const a = Math.abs(n)
  return a >= 1000 ? n.toFixed(0) : a >= 100 ? n.toFixed(1) : n.toFixed(2)
}

export const Dimensions = ({ box }: { box: Box3 }) => {
  if (box.isEmpty()) return null
  const { min, max } = box
  const size = box.getSize(new Vector3())
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
      <Html position={mid(x0, x1)} center className="dim-tag">
        <span>X</span> {fmt(size.x)}
      </Html>
      <Html position={mid(y0, y1)} center className="dim-tag">
        <span>Y</span> {fmt(size.y)}
      </Html>
      <Html position={mid(z0, z1)} center className="dim-tag">
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
