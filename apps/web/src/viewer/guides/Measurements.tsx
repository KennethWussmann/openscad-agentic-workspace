import { Html, Line } from '@react-three/drei'
import type { Vec3 } from '@scad/protocol'
import { Vector3 } from 'three'
import { fmt } from '../../lib/format.ts'
import type { Measurement } from '../../store/store.ts'

export const Measurements = ({ measures, pending }: { measures: Measurement[]; pending: Vec3 | null }) => (
  <group>
    {measures.map((m) => {
      const a = new Vector3(...m.a)
      const b = new Vector3(...m.b)
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
