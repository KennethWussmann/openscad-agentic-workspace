import type { Vec3 } from '@scad/protocol'
import type { MeshData } from '../../mesh/model3mf.ts'

export type Bounds = {
  min: Vec3
  max: Vec3
}

export type SceneMesh = {
  positions: Float32Array
  triangles: Uint32Array
  corners: Float32Array
  colors: Float32Array
  bounds: Bounds
}

const NEUTRAL = ['#b8c4d0', '#8fb3c8', '#c8b38f', '#9fc4ae', '#c49fb4', '#a7a0cc']
const SMOOTH_LIMIT = 250_000
const CREASE = Math.cos((38 * Math.PI) / 180)

export const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

const unpack = (rgb: number): Vec3 => [
  srgbToLinear(((rgb >> 16) & 255) / 255),
  srgbToLinear(((rgb >> 8) & 255) / 255),
  srgbToLinear((rgb & 255) / 255),
]

export const merge = (meshes: MeshData[]) => {
  const vertexCount = meshes.reduce((n, m) => n + m.positions.length / 3, 0)
  const triangleCount = meshes.reduce((n, m) => n + m.index.length / 3, 0)
  const positions = new Float32Array(vertexCount * 3)
  const triangles = new Uint32Array(triangleCount * 3)
  const colors = new Float32Array(triangleCount * 3)
  let vertexBase = 0
  let triangleBase = 0
  meshes.forEach((mesh, body) => {
    const fallback = unpack(Number.parseInt(NEUTRAL[body % NEUTRAL.length].slice(1), 16))
    for (let i = 0; i < mesh.positions.length; i++) positions[vertexBase * 3 + i] = mesh.positions[i]
    for (let i = 0; i < mesh.index.length; i++) triangles[triangleBase * 3 + i] = mesh.index[i] + vertexBase
    for (let t = 0; t < mesh.index.length / 3; t++) {
      const rgb = mesh.colors[t]
      const c = rgb >= 0 ? unpack(rgb) : fallback
      colors.set(c, (triangleBase + t) * 3)
    }
    vertexBase += mesh.positions.length / 3
    triangleBase += mesh.index.length / 3
  })
  return { positions, triangles, colors }
}

const boundsOf = (positions: Float32Array): Bounds => {
  const min: Bounds['min'] = [Infinity, Infinity, Infinity]
  const max: Bounds['max'] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k])
      max[k] = Math.max(max[k], positions[i + k])
    }
  return { min, max }
}

const faceNormals = (positions: Float32Array, triangles: Uint32Array) => {
  const out = new Float32Array(triangles.length)
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3
    const b = triangles[t + 1] * 3
    const c = triangles[t + 2] * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    out[t] = uy * vz - uz * vy
    out[t + 1] = uz * vx - ux * vz
    out[t + 2] = ux * vy - uy * vx
  }
  return out
}

const weld = (positions: Float32Array, triangles: Uint32Array, scale: number) => {
  const ids = new Map<string, number>()
  const remap = new Uint32Array(positions.length / 3)
  const step = Math.max(scale * 1e-5, 1e-6)
  for (let v = 0; v < remap.length; v++) {
    const key = `${Math.round(positions[v * 3] / step)},${Math.round(positions[v * 3 + 1] / step)},${Math.round(positions[v * 3 + 2] / step)}`
    let id = ids.get(key)
    if (id === undefined) {
      id = ids.size
      ids.set(key, id)
    }
    remap[v] = id
  }
  const offsets = new Uint32Array(ids.size + 1)
  for (const t of triangles) offsets[remap[t] + 1]++
  for (let i = 0; i < ids.size; i++) offsets[i + 1] += offsets[i]
  const fill = offsets.slice(0, ids.size)
  const incident = new Uint32Array(triangles.length)
  for (let c = 0; c < triangles.length; c++) incident[fill[remap[triangles[c]]]++] = Math.floor(c / 3)
  return { remap, offsets, incident }
}

const cornerNormals = (positions: Float32Array, triangles: Uint32Array, scale: number) => {
  const faces = faceNormals(positions, triangles)
  const corners = new Float32Array(triangles.length * 3)
  const unit = new Float32Array(faces.length)
  for (let t = 0; t < faces.length; t += 3) {
    const len = Math.hypot(faces[t], faces[t + 1], faces[t + 2]) || 1
    unit[t] = faces[t] / len
    unit[t + 1] = faces[t + 1] / len
    unit[t + 2] = faces[t + 2] / len
  }
  if (triangles.length / 3 > SMOOTH_LIMIT) {
    for (let c = 0; c < triangles.length; c++)
      corners.set(unit.subarray(Math.floor(c / 3) * 3, Math.floor(c / 3) * 3 + 3), c * 3)
    return corners
  }
  const { remap, offsets, incident } = weld(positions, triangles, scale)
  for (let c = 0; c < triangles.length; c++) {
    const t = Math.floor(c / 3)
    const v = remap[triangles[c]]
    let x = 0
    let y = 0
    let z = 0
    for (let i = offsets[v]; i < offsets[v + 1]; i++) {
      const u = incident[i]
      const dot = unit[u * 3] * unit[t * 3] + unit[u * 3 + 1] * unit[t * 3 + 1] + unit[u * 3 + 2] * unit[t * 3 + 2]
      if (dot < CREASE) continue
      x += faces[u * 3]
      y += faces[u * 3 + 1]
      z += faces[u * 3 + 2]
    }
    const len = Math.hypot(x, y, z)
    if (len > 0) corners.set([x / len, y / len, z / len], c * 3)
    else corners.set(unit.subarray(t * 3, t * 3 + 3), c * 3)
  }
  return corners
}

export const buildScene = (meshes: MeshData[]): SceneMesh | null => {
  const merged = merge(meshes)
  if (merged.triangles.length === 0) return null
  const bounds = boundsOf(merged.positions)
  const scale = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2])
  if (!(scale > 0)) return null
  return { ...merged, corners: cornerNormals(merged.positions, merged.triangles, scale), bounds }
}
