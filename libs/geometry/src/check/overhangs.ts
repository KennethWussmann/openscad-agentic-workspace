export const BED_TOLERANCE = 0.01
export const BED_FACE = -1
const BED_NORMAL = -0.999

export const overhangAngle = (nz: number) => (nz >= 0 ? 0 : (Math.asin(Math.min(1, -nz)) * 180) / Math.PI)

export const overhangField = (positions: ArrayLike<number>, index: ArrayLike<number> | null, bedZ: number) => {
  const count = index ? index.length / 3 : positions.length / 9
  const out = new Float32Array(count)
  const v = (t: number, k: number) => (index ? index[3 * t + k] : 3 * t + k)
  for (let t = 0; t < count; t++) {
    const a = 3 * v(t, 0)
    const b = 3 * v(t, 1)
    const c = 3 * v(t, 2)
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const z = nz / len
    const onBed =
      z < BED_NORMAL &&
      positions[a + 2] <= bedZ + BED_TOLERANCE &&
      positions[b + 2] <= bedZ + BED_TOLERANCE &&
      positions[c + 2] <= bedZ + BED_TOLERANCE
    out[t] = onBed ? BED_FACE : overhangAngle(z)
  }
  return out
}
