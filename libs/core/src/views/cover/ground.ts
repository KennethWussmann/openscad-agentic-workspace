import type { Vec3 } from '@scad/protocol'
import type { SceneMesh } from './mesh.ts'

export const GRID = 512

export type Ground = {
  z: number
  centerX: number
  centerY: number
  half: number
  shadow: Float32Array
  contact: Float32Array
}

const fillTriangle = (
  grid: Float32Array,
  p: [number, number, number, number, number, number],
  v: [number, number, number],
  combine: (old: number, value: number) => number,
) => {
  const [x0, y0, x1, y1, x2, y2] = p
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
  if (Math.abs(area) < 1e-9) return
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
  const maxX = Math.min(GRID - 1, Math.ceil(Math.max(x0, x1, x2)))
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
  const maxY = Math.min(GRID - 1, Math.ceil(Math.max(y0, y1, y2)))
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) / area
      const w2 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) / area
      const w0 = 1 - w1 - w2
      const slack = -0.6 / Math.sqrt(Math.abs(area) + 1)
      if (w0 < slack || w1 < slack || w2 < slack) continue
      const value = w0 * v[0] + w1 * v[1] + w2 * v[2]
      const at = y * GRID + x
      grid[at] = combine(grid[at], value)
    }
}

const blurPass = (src: Float32Array, dst: Float32Array, radius: number, horizontal: boolean) => {
  const span = radius * 2 + 1
  for (let line = 0; line < GRID; line++) {
    let sum = 0
    const at = (i: number) => (horizontal ? line * GRID + i : i * GRID + line)
    for (let i = -radius; i <= radius; i++) sum += src[at(Math.min(GRID - 1, Math.max(0, i)))]
    for (let i = 0; i < GRID; i++) {
      dst[at(i)] = sum / span
      sum += src[at(Math.min(GRID - 1, i + radius + 1))] - src[at(Math.max(0, i - radius))]
    }
  }
}

const blur = (grid: Float32Array, radius: number) => {
  const r = Math.max(1, Math.round(radius))
  const tmp = new Float32Array(grid.length)
  for (let i = 0; i < 3; i++) {
    blurPass(grid, tmp, r, true)
    blurPass(tmp, grid, r, false)
  }
}

export const buildGround = (scene: SceneMesh, toLight: Vec3): Ground => {
  const { min, max } = scene.bounds
  const sizeX = max[0] - min[0]
  const sizeY = max[1] - min[1]
  const sizeZ = max[2] - min[2]
  const flat = Math.max(sizeX, sizeY)
  const centerX = (min[0] + max[0]) / 2
  const centerY = (min[1] + max[1]) / 2
  const half = flat * 0.75 + sizeZ * 0.9
  const cell = GRID / (2 * half)
  const z = min[2]
  const shadow = new Float32Array(GRID * GRID)
  const contact = new Float32Array(GRID * GRID).fill(Infinity)
  const slide = toLight[2] > 0.05 ? 1 / toLight[2] : 0
  const p = scene.positions
  const t = scene.triangles
  const toGrid = (x: number, y: number): [number, number] => [(x - centerX + half) * cell, (y - centerY + half) * cell]
  for (let i = 0; i < t.length; i += 3) {
    const corner = [0, 1, 2].map((k) => t[i + k] * 3)
    const heights = corner.map((c) => p[c + 2] - z) as [number, number, number]
    const flatPts = corner.flatMap((c) => toGrid(p[c], p[c + 1])) as [number, number, number, number, number, number]
    fillTriangle(contact, flatPts, heights, Math.min)
    const cast = corner.flatMap((c, k) =>
      toGrid(p[c] - toLight[0] * heights[k] * slide, p[c + 1] - toLight[1] * heights[k] * slide),
    ) as [number, number, number, number, number, number]
    fillTriangle(shadow, cast, [1, 1, 1], Math.max)
  }
  const reach = Math.max(sizeZ, flat * 0.25)
  for (let i = 0; i < contact.length; i++)
    contact[i] = Number.isFinite(contact[i]) ? Math.exp(-contact[i] / (reach * 0.1)) : 0
  blur(contact, (flat * 0.06 + reach * 0.03) * cell)
  blur(shadow, (flat * 0.02 + reach * 0.035) * cell)
  return { z, centerX, centerY, half, shadow, contact }
}

const bilinear = (grid: Float32Array, gx: number, gy: number) => {
  const x = Math.min(GRID - 1.001, Math.max(0, gx - 0.5))
  const y = Math.min(GRID - 1.001, Math.max(0, gy - 0.5))
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const at = iy * GRID + ix
  return (
    (grid[at] * (1 - fx) + grid[at + 1] * fx) * (1 - fy) + (grid[at + GRID] * (1 - fx) + grid[at + GRID + 1] * fx) * fy
  )
}

export const sampleGround = (ground: Ground, x: number, y: number): [number, number] => {
  const cell = GRID / (2 * ground.half)
  const gx = (x - ground.centerX + ground.half) * cell
  const gy = (y - ground.centerY + ground.half) * cell
  if (gx < 0 || gy < 0 || gx > GRID || gy > GRID) return [0, 0]
  return [bilinear(ground.shadow, gx, gy), bilinear(ground.contact, gx, gy)]
}
