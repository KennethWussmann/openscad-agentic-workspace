import { Html, Line } from '@react-three/drei'
import type { Vec3 } from '@scad/protocol'
import { EDITOR_Z, tipOf } from './placement.ts'

type BalloonProps = {
  point: Vec3
  normal: Vec3
  extent: number
  label: string
  variant: 'draft' | 'active' | 'sent'
  title: string
  onSelect?: () => void
}

export const Balloon = ({ point, normal, extent, label, variant, title, onSelect }: BalloonProps) => {
  const tip = tipOf(point, normal, extent)
  const color = variant === 'sent' ? '#5ad1e6' : '#f2a541'
  return (
    <group>
      <Line
        points={[point, tip]}
        color={color}
        lineWidth={variant === 'active' ? 2 : 1.4}
        dashed={variant === 'sent'}
        dashSize={1.2}
        gapSize={0.8}
        depthTest={false}
        transparent
        opacity={variant === 'sent' ? 0.7 : 1}
        renderOrder={11}
      />
      <Html position={point} center className={`note-anchor is-${variant}`} />
      <Html position={tip} center zIndexRange={variant === 'active' ? EDITOR_Z : undefined}>
        {onSelect ? (
          <button
            type="button"
            className={`note-balloon is-${variant}`}
            title={title || 'Empty note'}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            {label}
          </button>
        ) : (
          <span className={`note-balloon is-${variant}`} title={title}>
            {label}
          </span>
        )}
      </Html>
    </group>
  )
}
