import type {
  BBox,
  BedCheck,
  BodiesCheck,
  CheckStatus,
  IslandCheck,
  ManifoldCheck,
  PartCheck,
  PrintProfile,
  RegionCheck,
  Vec3,
} from '@scad/protocol'
import { buildTopology } from '../mesh/topology.ts'
import { findBodies } from './bodies.ts'
import { findIslands } from './islands.ts'
import { checkManifold } from './manifold.ts'
import { BED_TOLERANCE, overhangField } from './overhangs.ts'
import { groupRegions } from './regions.ts'
import { MAX_REGIONS, reportBox } from './report.ts'
import { wallLimits, worstStatus } from './status.ts'
import { thicknessField } from './thickness.ts'

const ANGLE_TOLERANCE = 0.01
const THICKNESS_TOLERANCE = 1e-3
const FLOAT_TOLERANCE = 0.05

const checkBed = (bbox: BBox | null, bed: Vec3): BedCheck => {
  const size: Vec3 = bbox?.size ?? [0, 0, 0]
  const within = (x: number, y: number) => x <= bed[0] + 1e-6 && y <= bed[1] + 1e-6 && size[2] <= bed[2] + 1e-6
  const fits = within(size[0], size[1])
  const fitsRotated = within(size[1], size[0])
  const minZ = bbox?.min[2] ?? 0
  const status: CheckStatus = !fits && !fitsRotated ? 'fail' : !fits || Math.abs(minZ) > BED_TOLERANCE ? 'warn' : 'pass'
  return { status, size, bed, fits, fitsRotated, minZ }
}

export type MeshAnalysis = Omit<PartCheck, 'id' | 'label' | 'durationMs'>

export const analyzeMesh = (
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  profile: PrintProfile,
): MeshAnalysis => {
  const topo = buildTopology(positions, index)
  const n = topo.areas.length
  let bbox: BBox | null = null
  if (topo.points.length) {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < topo.points.length; i += 3)
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], topo.points[i + j])
        max[j] = Math.max(max[j], topo.points[i + j])
      }
    bbox = reportBox(min, max)
  }
  const bedZ = bbox?.min[2] ?? 0

  const edges = checkManifold(topo)
  const bodies = findBodies(topo)
  const solids = bodies.filter((b) => b.volume > 0)
  const inverted = bodies.length > 0 && solids.length === 0
  const manifold: ManifoldCheck = {
    status:
      edges.openEdges || edges.nonManifoldEdges || edges.flippedEdges || inverted
        ? 'fail'
        : edges.foldedEdges
          ? 'warn'
          : 'pass',
    ...edges,
    inverted,
  }

  let overhangs: RegionCheck | null = null
  let islands: IslandCheck | null = null
  if (profile.process === 'fdm') {
    const angles = overhangField(topo.points, topo.tris, bedZ)
    const steep = new Uint8Array(n)
    for (let t = 0; t < n; t++) steep[t] = angles[t] > profile.overhangAngle + ANGLE_TOLERANCE ? 1 : 0
    const over = groupRegions(topo, steep, angles, 'max', profile.minRegionArea)
    overhangs = { status: over.regions.length ? 'warn' : 'pass', ...over }
  } else {
    const found = findIslands(topo, bedZ)
    islands = {
      status: found.length ? 'warn' : 'pass',
      count: found.length,
      islands: found.slice(0, MAX_REGIONS).map(({ triangles: _, ...island }) => island),
    }
  }

  const limits = wallLimits(profile)
  const thickness = thicknessField(topo)
  const thin = new Uint8Array(n)
  for (let t = 0; t < n; t++) thin[t] = thickness[t] < limits.warn - THICKNESS_TOLERANCE ? 1 : 0
  const slim = groupRegions(topo, thin, thickness, 'min', profile.minRegionArea)
  const walls: RegionCheck = {
    status: slim.worst === null ? 'pass' : slim.worst < limits.fail - THICKNESS_TOLERANCE ? 'fail' : 'warn',
    ...slim,
  }

  const floating = solids.filter((b) => b.bbox.min[2] > bedZ + FLOAT_TOLERANCE)
  const small = solids.filter((b) => Math.max(...b.bbox.size) < limits.warn)
  const voids = bodies.length - solids.length
  const bodyCheck: BodiesCheck = {
    status: floating.length || small.length || (profile.process === 'resin' && voids) ? 'warn' : 'pass',
    bodies: solids.length,
    voids,
    floating: floating.slice(0, MAX_REGIONS),
    small: small.slice(0, MAX_REGIONS),
  }

  const bed = checkBed(bbox, profile.bed)
  return {
    status: worstStatus(
      [manifold.status, bed.status, overhangs?.status, islands?.status, walls.status, bodyCheck.status].filter(
        (x): x is CheckStatus => x !== undefined,
      ),
    ),
    triangles: n,
    bbox,
    manifold,
    bed,
    overhangs,
    islands,
    walls,
    bodies: bodyCheck,
  }
}
