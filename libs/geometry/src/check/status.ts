import type { CheckStatus, PrintProfile } from '@scad/protocol'

const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 }

export const worstStatus = (statuses: CheckStatus[]): CheckStatus =>
  statuses.reduce<CheckStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'pass')

export const wallLimits = (profile: PrintProfile) => ({
  fail: profile.process === 'fdm' ? profile.nozzle : profile.minFeature,
  warn: profile.minWall,
})
