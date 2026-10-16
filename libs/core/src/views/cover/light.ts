import type { Vec3 } from '@scad/protocol'
import { add, type Camera, normalize, scale } from './camera.ts'

export type Lights = {
  key: Vec3
  fill: Vec3
  rim: Vec3
}

export const lightsFor = (cam: Camera): Lights => ({
  key: normalize(add(scale(cam.right, -0.62), scale(cam.forward, -0.38), [0, 0, 1.25])),
  fill: normalize(add(scale(cam.right, 0.9), scale(cam.forward, -0.35), [0, 0, 0.35])),
  rim: normalize(add(scale(cam.right, 0.55), scale(cam.forward, 0.85), [0, 0, 0.5])),
})

const SPECULAR_POWER = 56

export const shade = (
  nx: number,
  ny: number,
  nz: number,
  vx: number,
  vy: number,
  vz: number,
  albedo: Float32Array,
  at: number,
  lights: Lights,
  out: Float32Array,
) => {
  let facing = nx * vx + ny * vy + nz * vz
  if (facing < 0) {
    nx = -nx
    ny = -ny
    nz = -nz
    facing = -facing
  }
  const { key, fill, rim } = lights
  const hemi = 0.5 + 0.5 * nz
  const ambient = 0.06 + 0.2 * hemi
  const bounce = Math.max(0, -nz) * 0.1
  const keyDiffuse = Math.max(0, nx * key[0] + ny * key[1] + nz * key[2])
  const fillDiffuse = Math.max(0, nx * fill[0] + ny * fill[1] + nz * fill[2])
  const rimFacing = Math.max(0, nx * rim[0] + ny * rim[1] + nz * rim[2])
  const rimTerm = (1 - facing) ** 3 * rimFacing * 0.55
  let hx = key[0] + vx
  let hy = key[1] + vy
  let hz = key[2] + vz
  const hl = Math.hypot(hx, hy, hz) || 1
  hx /= hl
  hy /= hl
  hz /= hl
  const spec = keyDiffuse > 0 ? Math.max(0, nx * hx + ny * hy + nz * hz) ** SPECULAR_POWER * 0.32 : 0
  const keyK = keyDiffuse * 0.92
  const fillK = fillDiffuse * 0.3
  const r = albedo[at]
  const g = albedo[at + 1]
  const b = albedo[at + 2]
  out[0] = r * (ambient * 0.9 + bounce * 1.0 + keyK * 1.0 + fillK * 0.75) + spec + rimTerm * 0.55
  out[1] = g * (ambient * 0.96 + bounce * 0.85 + keyK * 0.96 + fillK * 0.85) + spec + rimTerm * 0.85
  out[2] = b * (ambient * 1.05 + bounce * 0.7 + keyK * 0.9 + fillK * 1.0) + spec + rimTerm
}
