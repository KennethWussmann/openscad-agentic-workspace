import type { Camera } from './camera.ts'
import { type Lights, shade } from './light.ts'
import type { SceneMesh } from './mesh.ts'

export type Buffers = {
  width: number
  height: number
  depth: Float32Array
  color: Float32Array
  normal: Float32Array
}

export const pixelRay = (cam: Camera, width: number, height: number, x: number, y: number) => {
  const ndcX = ((x + 0.5) / width) * 2 - 1
  const ndcY = 1 - ((y + 0.5) / height) * 2
  const a = (ndcX - cam.offsetX) * cam.tx
  const b = (ndcY - cam.offsetY) * cam.ty
  return [
    cam.forward[0] + cam.right[0] * a + cam.up[0] * b,
    cam.forward[1] + cam.right[1] * a + cam.up[1] * b,
    cam.forward[2] + cam.right[2] * a + cam.up[2] * b,
  ] as const
}

export const rasterize = (scene: SceneMesh, cam: Camera, lights: Lights, width: number, height: number): Buffers => {
  const depth = new Float32Array(width * height).fill(Infinity)
  const color = new Float32Array(width * height * 3)
  const normal = new Float32Array(width * height * 3)
  const { positions, triangles, corners, colors } = scene
  const vertexCount = positions.length / 3
  const sx = new Float32Array(vertexCount)
  const sy = new Float32Array(vertexCount)
  const sw = new Float32Array(vertexCount)
  const [ex, ey, ez] = cam.eye
  const [fx, fy, fz] = cam.forward
  const [rx, ry, rz] = cam.right
  const [ux, uy, uz] = cam.up
  for (let v = 0; v < vertexCount; v++) {
    const dx = positions[v * 3] - ex
    const dy = positions[v * 3 + 1] - ey
    const dz = positions[v * 3 + 2] - ez
    const w = dx * fx + dy * fy + dz * fz
    sw[v] = w
    sx[v] = (((dx * rx + dy * ry + dz * rz) / (w * cam.tx) + cam.offsetX) * 0.5 + 0.5) * width
    sy[v] = (0.5 - ((dx * ux + dy * uy + dz * uz) / (w * cam.ty) + cam.offsetY) * 0.5) * height
  }
  const colA = new Float32Array(width)
  const rowB = new Float32Array(height)
  for (let x = 0; x < width; x++) colA[x] = (((x + 0.5) / width) * 2 - 1 - cam.offsetX) * cam.tx
  for (let y = 0; y < height; y++) rowB[y] = (1 - ((y + 0.5) / height) * 2 - cam.offsetY) * cam.ty
  const radiance = new Float32Array(3)
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]
    const b = triangles[t + 1]
    const c = triangles[t + 2]
    const w0 = sw[a]
    const w1 = sw[b]
    const w2 = sw[c]
    if (w0 <= 0 || w1 <= 0 || w2 <= 0) continue
    const x0 = sx[a]
    const y0 = sy[a]
    const x1 = sx[b]
    const y1 = sy[b]
    const x2 = sx[c]
    const y2 = sy[c]
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-12) continue
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
    const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
    const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)))
    const iw0 = 1 / w0
    const iw1 = 1 / w1
    const iw2 = 1 / w2
    const n = t * 3
    const colorAt = (t / 3) * 3
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const l1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) / area
        const l2 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) / area
        const l0 = 1 - l1 - l2
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue
        const p0 = l0 * iw0
        const p1 = l1 * iw1
        const p2 = l2 * iw2
        const iw = p0 + p1 + p2
        const d = 1 / iw
        const at = y * width + x
        if (d >= depth[at]) continue
        depth[at] = d
        const b0 = p0 * d
        const b1 = p1 * d
        const b2 = p2 * d
        let nx = corners[n] * b0 + corners[n + 3] * b1 + corners[n + 6] * b2
        let ny = corners[n + 1] * b0 + corners[n + 4] * b1 + corners[n + 7] * b2
        let nz = corners[n + 2] * b0 + corners[n + 5] * b1 + corners[n + 8] * b2
        const nl = Math.hypot(nx, ny, nz) || 1
        nx /= nl
        ny /= nl
        nz /= nl
        const dx = fx + rx * colA[x] + ux * rowB[y]
        const dy = fy + ry * colA[x] + uy * rowB[y]
        const dz = fz + rz * colA[x] + uz * rowB[y]
        const dl = Math.hypot(dx, dy, dz)
        shade(nx, ny, nz, -dx / dl, -dy / dl, -dz / dl, colors, colorAt, lights, radiance)
        color[at * 3] = radiance[0]
        color[at * 3 + 1] = radiance[1]
        color[at * 3 + 2] = radiance[2]
        const facing = nx * dx + ny * dy + nz * dz > 0 ? -1 : 1
        normal[at * 3] = nx * facing
        normal[at * 3 + 1] = ny * facing
        normal[at * 3 + 2] = nz * facing
      }
    }
  }
  return { width, height, depth, color, normal }
}

const SAMPLES = 14
const GOLDEN = 2.399963

const noise = (x: number, y: number) => {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)
  return v - Math.floor(v)
}

export const ambientOcclusion = (
  buffers: Buffers,
  cam: Camera,
  factor: number,
  outWidth: number,
  outHeight: number,
  radius: number,
) => {
  const { width, height, depth, normal } = buffers
  const focal = height / (2 * cam.ty)
  const out = new Float32Array(outWidth * outHeight).fill(1)
  const bias = radius * 0.04
  const reconstruct = (x: number, y: number, d: number): [number, number, number] => {
    const a = (((x + 0.5) / width) * 2 - 1 - cam.offsetX) * cam.tx
    const b = (1 - ((y + 0.5) / height) * 2 - cam.offsetY) * cam.ty
    return [
      cam.eye[0] + (cam.forward[0] + cam.right[0] * a + cam.up[0] * b) * d,
      cam.eye[1] + (cam.forward[1] + cam.right[1] * a + cam.up[1] * b) * d,
      cam.eye[2] + (cam.forward[2] + cam.right[2] * a + cam.up[2] * b) * d,
    ]
  }
  for (let oy = 0; oy < outHeight; oy++)
    for (let ox = 0; ox < outWidth; ox++) {
      const x = ox * factor + (factor >> 1)
      const y = oy * factor + (factor >> 1)
      const at = y * width + x
      const d = depth[at]
      if (!Number.isFinite(d)) continue
      const p = reconstruct(x, y, d)
      const nx = normal[at * 3]
      const ny = normal[at * 3 + 1]
      const nz = normal[at * 3 + 2]
      const reach = Math.min(90 * factor, Math.max(3, (radius * focal) / d))
      const spin = noise(ox, oy) * Math.PI * 2
      let occlusion = 0
      for (let i = 0; i < SAMPLES; i++) {
        const angle = i * GOLDEN + spin
        const r = Math.sqrt((i + 0.5) / SAMPLES) * reach
        const sx = Math.round(x + Math.cos(angle) * r)
        const sy = Math.round(y + Math.sin(angle) * r)
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
        const sd = depth[sy * width + sx]
        if (!Number.isFinite(sd)) continue
        const s = reconstruct(sx, sy, sd)
        const vx = s[0] - p[0]
        const vy = s[1] - p[1]
        const vz = s[2] - p[2]
        const dist = Math.hypot(vx, vy, vz)
        if (dist >= radius || dist < 1e-9) continue
        const lift = (vx * nx + vy * ny + vz * nz - bias) / dist
        if (lift > 0) occlusion += lift * (1 - dist / radius) ** 0.5
      }
      out[oy * outWidth + ox] = 1 - Math.min(1, (occlusion / SAMPLES) * 2.2)
    }
  return out
}

export const smoothOcclusion = (ao: Float32Array, covered: Uint8Array, width: number, height: number) => {
  const out = new Float32Array(ao.length).fill(1)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * width + x
      if (!covered[at]) continue
      let sum = 0
      let weight = 0
      for (let j = -2; j <= 2; j++)
        for (let i = -2; i <= 2; i++) {
          const nx = x + i
          const ny = y + j
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !covered[ny * width + nx]) continue
          sum += ao[ny * width + nx]
          weight++
        }
      out[at] = weight ? sum / weight : ao[at]
    }
  return out
}
