import { boxOf, roundVec } from '../mesh/math.ts'

const DIGITS = 3
export const MAX_REGIONS = 20
export const MAX_SAMPLES = 10

export const reportVec = (v: ArrayLike<number>) => roundVec(v, DIGITS)

export const reportBox = (min: ArrayLike<number>, max: ArrayLike<number>) => boxOf(min, max, DIGITS)
