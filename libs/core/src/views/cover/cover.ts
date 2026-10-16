import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import type { MeshData } from '../../mesh/model3mf.ts'
import { read3mf } from '../../mesh/model3mf.ts'
import { fitCamera } from './camera.ts'
import { buildGround, sampleGround } from './ground.ts'
import { lightsFor } from './light.ts'
import { buildScene } from './mesh.ts'
import { ambientOcclusion, pixelRay, rasterize, smoothOcclusion } from './raster.ts'

export const COVER_WIDTH = 960
export const COVER_HEIGHT = 720

export type CoverOptions = {
  width?: number
  height?: number
  samples?: number
  azimuth?: number
  elevation?: number
}

const tone = (x: number) => {
  const mapped = x < 0.82 ? x : 0.82 + 0.18 * (1 - Math.exp(-(x - 0.82) / 0.18))
  return Math.min(1, Math.max(0, mapped)) ** (1 / 2.2)
}

export const renderCover = (meshes: MeshData[], opts: CoverOptions = {}): PNG | null => {
  const width = opts.width ?? COVER_WIDTH
  const height = opts.height ?? COVER_HEIGHT
  const factor = opts.samples ?? 2
  const scene = buildScene(meshes)
  if (!scene) return null
  const sw = width * factor
  const sh = height * factor
  const cam = fitCamera(scene, {
    azimuth: opts.azimuth ?? (36 * Math.PI) / 180,
    elevation: opts.elevation ?? (27 * Math.PI) / 180,
    fov: (26 * Math.PI) / 180,
    aspect: width / height,
    margin: 0.26,
  })
  const lights = lightsFor(cam)
  const size = Math.max(...scene.bounds.max.map((v, i) => v - scene.bounds.min[i]))
  const buffers = rasterize(scene, cam, lights, sw, sh)
  const covered = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      covered[y * width + x] = Number.isFinite(
        buffers.depth[(y * factor + (factor >> 1)) * sw + x * factor + (factor >> 1)],
      )
        ? 1
        : 0
  const occlusion = smoothOcclusion(
    ambientOcclusion(buffers, cam, factor, width, height, size * 0.09),
    covered,
    width,
    height,
  )
  const ground = buildGround(scene, lights.key)
  const out = new PNG({ width, height })
  const area = factor * factor
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let hits = 0
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < factor; j++)
        for (let i = 0; i < factor; i++) {
          const at = (y * factor + j) * sw + x * factor + i
          if (!Number.isFinite(buffers.depth[at])) continue
          hits++
          r += buffers.color[at * 3]
          g += buffers.color[at * 3 + 1]
          b += buffers.color[at * 3 + 2]
        }
      const coverage = hits / area
      let shadow = 0
      if (coverage < 1) {
        const ray = pixelRay(cam, width, height, x, y)
        if (ray[2] < -1e-6) {
          const t = (ground.z - cam.eye[2]) / ray[2]
          const [cast, contact] = sampleGround(ground, cam.eye[0] + ray[0] * t, cam.eye[1] + ray[1] * t)
          shadow = Math.min(0.78, cast * 0.4 + contact * 0.55)
        }
      }
      const alpha = coverage + (1 - coverage) * shadow
      const ao = occlusion[y * width + x]
      const scale = hits ? ao / hits : 0
      const o = (y * width + x) * 4
      if (alpha <= 0) continue
      const weight = coverage / alpha
      out.data[o] = Math.round(tone(r * scale) * 255 * weight)
      out.data[o + 1] = Math.round(tone(g * scale) * 255 * weight)
      out.data[o + 2] = Math.round(tone(b * scale) * 255 * weight)
      out.data[o + 3] = Math.round(alpha * 255)
    }
  return out
}

export const writeCover = (models: string[], out: string, opts: CoverOptions = {}) => {
  const meshes = models.map((m) => read3mf(m))
  const png = renderCover(meshes, opts)
  if (!png) return false
  mkdirSync(path.dirname(out), { recursive: true })
  const tmp = `${out}.tmp`
  writeFileSync(tmp, PNG.sync.write(png))
  renameSync(tmp, out)
  return true
}
