import { BED_TOLERANCE, FOLD_ANGLE, wallLimits } from '@scad/geometry'
import type { Body, CheckRegion, CheckResult, PartCheck, PrintProfile } from '@scad/protocol'
import { formatBox, num, vec } from './common.ts'
import { formatProfile } from './profile.ts'

const LABEL = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' } as const

const MAX_LISTED = 5

const formatRegions = (regions: CheckRegion[], total: number, describe: (r: CheckRegion) => string) => {
  const lines = regions
    .slice(0, MAX_LISTED)
    .map((r) => `           - ${describe(r)}, ${num(r.area)} mm2 around ${vec(r.center)}, box ${formatBox(r.bbox)}`)
  if (total > MAX_LISTED) lines.push(`           ... ${total - MAX_LISTED} more`)
  return lines
}

const formatBody = (b: Body) => `${b.bbox.size.map(num).join(' x ')} mm at ${vec(b.bbox.min)}`

export const formatCheckPart = (p: PartCheck, s: PrintProfile) => {
  const limits = wallLimits(s)
  const row = (status: keyof typeof LABEL, name: string, text: string) =>
    `    ${LABEL[status]}  ${name.padEnd(10)} ${text}`
  const m = p.manifold
  const problems = [
    m.openEdges && `${m.openEdges} open edges`,
    m.nonManifoldEdges && `${m.nonManifoldEdges} non-manifold edges`,
    m.flippedEdges && `${m.flippedEdges} edges with flipped faces`,
    m.inverted && 'inside out (all normals point inwards)',
  ].filter(Boolean)
  const lines = [`  part ${p.id}${p.label ? ` (${p.label})` : ''}: ${LABEL[p.status]}  ${p.triangles} triangles`]
  lines.push(
    row(
      m.status,
      'manifold',
      `${problems.length ? problems.join(', ') : 'watertight'}${m.degenerate ? `, ${m.degenerate} degenerate triangles (ignored by slicers)` : ''}`,
    ),
  )
  if (m.samples.length) lines.push(`           at ${m.samples.slice(0, MAX_LISTED).map(vec).join(', ')}`)
  if (m.foldedEdges)
    lines.push(
      `           ${m.foldedEdges} edges (${num(m.foldedLength)} mm) fold back more than ${FOLD_ANGLE} deg: zero-thickness fins or flaps, usually from faces ending exactly on another face`,
      `           at ${m.folds.slice(0, MAX_LISTED).map(vec).join(', ')}`,
    )
  const b = p.bed
  const size = b.size.map(num).join(' x ')
  const bed = b.bed.map(num).join(' x ')
  const bedText =
    b.fits || b.fitsRotated
      ? `${size} mm fits ${bed}${b.fits ? '' : ' only rotated 90 deg around Z'}`
      : `${size} mm does not fit the ${bed} mm build volume`
  lines.push(
    row(
      b.status,
      'bed',
      `${bedText}${Math.abs(b.minZ) > BED_TOLERANCE ? `, lowest point at z = ${num(b.minZ)} instead of 0` : ''}`,
    ),
  )
  const o = p.overhangs
  if (o && s.process === 'fdm')
    lines.push(
      row(
        o.status,
        'overhangs',
        o.regions.length
          ? `${num(o.area)} mm2 steeper than ${num(s.overhangAngle)} deg in ${o.regions.length} region(s), up to ${num(o.worst ?? 0)} deg (90 = flat ceiling or bridge)`
          : `none steeper than ${num(s.overhangAngle)} deg`,
      ),
      ...formatRegions(o.regions, o.regions.length, (r) => `up to ${num(r.worst)} deg`),
    )
  const isl = p.islands
  if (isl)
    lines.push(
      row(
        isl.status,
        'islands',
        isl.count
          ? `${isl.count} island(s) start unsupported in this orientation and need supports`
          : 'none, every layer grows from the one below',
      ),
      ...isl.islands
        .slice(0, MAX_LISTED)
        .map(
          (i) =>
            `           - ${num(i.height)} mm above the bed at ${vec(i.center)}${i.area ? `, flat ${num(i.area)} mm2` : ''}`,
        ),
      ...(isl.count > MAX_LISTED ? [`           ... ${isl.count - MAX_LISTED} more`] : []),
    )
  const w = p.walls
  lines.push(
    row(
      w.status,
      'walls',
      w.regions.length
        ? `${num(w.area)} mm2 thinner than ${num(s.minWall)} mm in ${w.regions.length} region(s), thinnest ${num(w.worst ?? 0)} mm (${s.process === 'fdm' ? 'nozzle' : 'min feature'} ${num(limits.fail)})`
        : `nothing thinner than ${num(s.minWall)} mm`,
    ),
    ...formatRegions(w.regions, w.regions.length, (r) => `${num(r.worst)} mm`),
  )
  const bodies = p.bodies
  lines.push(
    row(
      bodies.status,
      'bodies',
      `${bodies.bodies} solid${bodies.bodies === 1 ? '' : 's'}${bodies.voids ? `, ${bodies.voids} enclosed void(s)${s.process === 'resin' ? ` trapping resin: add drain holes of at least ${num(s.drainHole)} mm` : ''}` : ''}${bodies.floating.length ? `, ${bodies.floating.length} floating above the bed` : ''}${bodies.small.length ? `, ${bodies.small.length} smaller than ${num(s.minWall)} mm` : ''}`,
    ),
    ...bodies.floating.slice(0, MAX_LISTED).map((x) => `           - floating ${formatBody(x)}`),
    ...bodies.small.slice(0, MAX_LISTED).map((x) => `           - small ${formatBody(x)}`),
  )
  return lines.join('\n')
}

export const formatCheck = (r: CheckResult) => {
  return [
    `${LABEL[r.status]}  ${r.project}  ${formatProfile(r.profile)}`,
    ...r.parts.map((p) => formatCheckPart(p, r.profile)),
  ].join('\n')
}
