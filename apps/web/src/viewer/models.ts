import { useEffect, useRef, useState } from 'react'
import { Box3, type BufferGeometry, Color, EdgesGeometry, type Material, type Mesh, type Object3D } from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

export type ModelMesh = {
  id: string
  geometry: BufferGeometry
  edges: BufferGeometry
  color: Color
  isDefaultColor: boolean
}

export type LoadedModel = {
  key: string
  meshes: ModelMesh[]
  box: Box3
}

export type ModelRequest = {
  key: string
  partId: string
  url: string
}

const OPENSCAD_DEFAULT = new Color('#f9d72c')
const loader = new ThreeMFLoader()
const cache = new Map<string, Promise<LoadedModel>>()
const MAX_CACHE = 48

const colorOf = (material: Material | Material[]) => {
  const m = (Array.isArray(material) ? material[0] : material) as Material & { color?: Color }
  return m?.color ? m.color.clone() : OPENSCAD_DEFAULT.clone()
}

const isDefault = (c: Color) =>
  Math.abs(c.r - OPENSCAD_DEFAULT.r) + Math.abs(c.g - OPENSCAD_DEFAULT.g) + Math.abs(c.b - OPENSCAD_DEFAULT.b) < 0.02

const parse = async (key: string, url: string): Promise<LoadedModel> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`)
  const root: Object3D = loader.parse(await res.arrayBuffer())
  root.updateMatrixWorld(true)
  const meshes: ModelMesh[] = []
  const box = new Box3()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    if (geometry.boundingBox) box.union(geometry.boundingBox)
    const color = colorOf(mesh.material)
    meshes.push({
      id: `${key}#${meshes.length}`,
      geometry,
      edges: new EdgesGeometry(geometry, 24),
      color,
      isDefaultColor: isDefault(color),
    })
  })
  return { key, meshes, box }
}

export const loadModel = (req: ModelRequest) => {
  let hit = cache.get(req.key)
  if (!hit) {
    hit = parse(req.key, req.url)
    hit.catch(() => cache.delete(req.key))
    cache.set(req.key, hit)
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
  }
  return hit
}

export const useModels = (requests: ModelRequest[]) => {
  const signature = requests.map((r) => r.key).join('|')
  const latest = useRef(requests)
  latest.current = requests
  const [state, setState] = useState<{ signature: string; models: Record<string, LoadedModel>; error: string | null }>({
    signature: '',
    models: {},
    error: null,
  })
  useEffect(() => {
    let alive = true
    Promise.all(latest.current.map(async (r) => [r.partId, await loadModel(r)] as const))
      .then((entries) => {
        if (alive) setState({ signature, models: Object.fromEntries(entries), error: null })
      })
      .catch((e: unknown) => {
        if (alive) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }))
      })
    return () => {
      alive = false
    }
  }, [signature])
  return state
}
