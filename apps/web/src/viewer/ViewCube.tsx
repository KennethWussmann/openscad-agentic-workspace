import { OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, Vector3 } from 'three'
import { rig, viewDirection } from './rig.ts'

type Region = {
  key: string
  dir: [number, number, number]
  size: [number, number, number]
  pos: [number, number, number]
}

const REGIONS: Region[] = []
for (const x of [-1, 0, 1])
  for (const y of [-1, 0, 1])
    for (const z of [-1, 0, 1]) {
      if (!x && !y && !z) continue
      const dir: [number, number, number] = [x, y, z]
      REGIONS.push({
        key: dir.join(','),
        dir,
        size: dir.map((c) => (c ? 0.2 : 0.6)) as [number, number, number],
        pos: dir.map((c) => c * 0.4) as [number, number, number],
      })
    }

type Face = { label: string; pos: [number, number, number]; rot: [number, number, number] }

const FACES: Face[] = [
  { label: 'FRONT', pos: [0, -0.501, 0], rot: [Math.PI / 2, 0, 0] },
  { label: 'BACK', pos: [0, 0.501, 0], rot: [Math.PI / 2, Math.PI, 0] },
  { label: 'RIGHT', pos: [0.501, 0, 0], rot: [Math.PI / 2, Math.PI / 2, 0] },
  { label: 'LEFT', pos: [-0.501, 0, 0], rot: [Math.PI / 2, -Math.PI / 2, 0] },
  { label: 'TOP', pos: [0, 0, 0.501], rot: [0, 0, 0] },
  { label: 'BOTTOM', pos: [0, 0, -0.501], rot: [Math.PI, 0, 0] },
]

const labelTexture = (label: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0)'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#d7e1ea'
    ctx.font = `600 ${label.length > 5 ? 38 : 44}px "Martian Mono Variable", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 128, 132)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

const CubeScene = () => {
  const [hover, setHover] = useState<string | null>(null)
  const [textures, setTextures] = useState<CanvasTexture[]>(() => FACES.map((f) => labelTexture(f.label)))
  useEffect(() => {
    document.fonts.ready.then(() => setTextures(FACES.map((f) => labelTexture(f.label))))
  }, [])
  const forward = useMemo(() => new Vector3(), [])
  useFrame(({ camera }) => {
    forward.set(0, 0, 1).applyQuaternion(rig.orientation)
    camera.position.copy(forward).multiplyScalar(4)
    camera.quaternion.copy(rig.orientation)
    camera.updateMatrixWorld()
  })
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, -3, 4]} intensity={1.2} />
      {REGIONS.map((r) => (
        <mesh
          key={r.key}
          position={r.pos}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(r.key)
          }}
          onPointerOut={() => setHover((h) => (h === r.key ? null : h))}
          onClick={(e) => {
            e.stopPropagation()
            viewDirection(new Vector3(...r.dir))
          }}
        >
          <boxGeometry args={r.size} />
          <meshStandardMaterial
            color={hover === r.key ? '#5ad1e6' : r.dir.filter(Boolean).length === 1 ? '#1d2a37' : '#24384a'}
            roughness={0.8}
          />
        </mesh>
      ))}
      {FACES.map((f, i) => (
        <mesh key={f.label} position={f.pos} rotation={f.rot} raycast={() => null}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial map={textures[i]} transparent side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

export const ViewCube = () => (
  <div className="viewcube">
    <Canvas flat dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <OrthographicCamera makeDefault zoom={52} near={0.1} far={20} position={[0, 0, 4]} />
      <CubeScene />
    </Canvas>
    <div className="viewcube-axes">
      <button type="button" onClick={() => viewDirection(new Vector3(1, -1, 0.8))} title="Isometric (0)">
        ISO
      </button>
    </div>
  </div>
)
