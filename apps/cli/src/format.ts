import {
  type Annotation,
  type AnnotationProposal,
  type AnnotationSource,
  type BBox,
  BED_TOLERANCE,
  type Body,
  type CheckRegion,
  type CheckResult,
  type CheckSettings,
  type Diagnostic,
  FOLD_ANGLE,
  type PartCheck,
  type RenderResult,
  type Surface,
  type ViewSection,
} from '@scad/core'

const num = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '')

export const formatBBox = (b: BBox | null) =>
  b ? `${b.size.map(num).join(' x ')} mm  (min ${b.min.map(num).join(', ')} / max ${b.max.map(num).join(', ')})` : '-'

export const formatDiagnostic = (d: Diagnostic) =>
  `${d.level.toUpperCase()}${d.file ? ` ${d.file}${d.line ? `:${d.line}` : ''}` : ''}: ${d.message}`

export const formatRender = (r: RenderResult) => {
  const lines = [`${r.status === 'ok' ? 'OK' : 'FAILED'}  ${r.project}  ${r.durationMs} ms`]
  if (r.error) lines.push(`  ERROR: ${r.error}`)
  for (const p of r.parts) {
    lines.push(
      `  part ${p.id}${p.label ? ` (${p.label})` : ''}: ${p.status}${p.stale ? ', showing last good model' : ''}  ${p.file}`,
    )
    if (p.status === 'ok') lines.push(`    size ${formatBBox(p.bbox)}  facets ${p.facets ?? '-'}`)
    const echoes = p.diagnostics.filter((d) => d.level === 'echo')
    for (const d of p.diagnostics.filter((d) => d.level !== 'echo')) lines.push(`    ${formatDiagnostic(d)}`)
    for (const d of echoes.slice(0, 20)) lines.push(`    ECHO: ${d.message}`)
    if (echoes.length > 20) lines.push(`    ... ${echoes.length - 20} more ECHO lines`)
  }
  if (r.params.length)
    lines.push(`  params: ${r.params.map((p) => `${p.name}=${JSON.stringify(p.initial)}`).join(', ')}`)
  return lines.join('\n')
}

export const table = (rows: string[][]) => {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? []
  return rows
    .map((r) =>
      r
        .map((c, i) => c.padEnd(widths[i]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

const vec = (v: number[]) => `(${v.map(num).join(', ')})`

const formatSource = (s: AnnotationSource) =>
  s.kind === 'version'
    ? `version ${s.version}`
    : s.kind === 'tweak'
      ? `tweak preview with ${Object.entries(s.params ?? {})
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ')} (not in the source)`
      : `working copy${s.render ? ` rendered ${s.render}` : ''}`

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const

export const formatSection = (s: ViewSection) => {
  if (s.axis === 'free') return `free plane, kept side ${vec(s.normal)} . p + ${num(s.constant)} >= 0`
  return s.normal[AXIS_INDEX[s.axis]] < 0
    ? `kept ${s.axis} <= ${num(s.constant)}`
    : `kept ${s.axis} >= ${num(-s.constant)}`
}

const formatBox = (b: BBox) => `${vec(b.min)}..${vec(b.max)}, size ${b.size.map(num).join(' x ')}`

const formatSurface = (s: Surface) => {
  if (s.type === 'planar')
    return [`surface: planar, normal ${vec(s.facet.normal)}, area ${num(s.area)} mm2, box ${formatBox(s.bbox)}`]
  const lines: string[] = []
  const c = s.cylinder
  if (c)
    lines.push(
      `surface: cylindrical ${c.concave ? 'hole/concave' : 'boss/convex'}, d ${num(c.radius * 2)} (r ${num(c.radius)}), axis ${vec(c.axis)} through ${vec(c.center)}, length ${num(c.length)}, arc ${num(c.arc)} deg`,
    )
  else lines.push(`surface: curved, area ${num(s.area)} mm2, box ${formatBox(s.bbox)}`)
  lines.push(`facet: normal ${vec(s.facet.normal)}, area ${num(s.facet.area)} mm2, box ${formatBox(s.facet.bbox)}`)
  return lines
}

export const formatAnnotation = (a: Annotation, view: AnnotationSource) => {
  const lines = [
    `#${a.n} "${a.text.replace(/\n/g, ' / ')}"`,
    `   part ${a.part.id}${a.part.file ? ` (${a.part.file})` : ''}${a.part.mesh > 0 ? ` mesh ${a.part.mesh}` : ''}${a.part.color !== 'default' ? ` color ${a.part.color}` : ''}, ${a.kind} at ${vec(a.point)}, normal ${vec(a.normal)}`,
  ]
  if (a.edge)
    lines.push(
      `   edge: ${vec(a.edge.a)} -> ${vec(a.edge.b)}, length ${num(a.edge.length)}, ${num(a.edge.angle)} deg between faces, ${a.edge.convex ? 'convex (outside corner)' : 'concave (inside corner)'}`,
    )
  if (a.surface) lines.push(...formatSurface(a.surface).map((l) => `   ${l}`))
  if (JSON.stringify(a.source) !== JSON.stringify(view)) lines.push(`   placed on: ${formatSource(a.source)}`)
  return lines.join('\n')
}

export const formatAnnotations = (p: AnnotationProposal, snapshot: string) =>
  [
    `Annotations from the browser (${p.createdAt}, based on ${p.basedOn ?? 'no version'})`,
    `  view: ${formatSource(p.source)}`,
    `  camera: ${p.camera.projection} from ${vec(p.camera.position)} looking at ${vec(p.camera.target)}`,
    ...(p.section ? [`  section: ${formatSection(p.section)}`] : []),
    `  snapshot: ${snapshot}  (the view the user saw, pins numbered like the notes)`,
    ...(p.note ? [`  note: ${p.note}`] : []),
    '',
    ...p.annotations.map((a) => formatAnnotation(a, p.source)),
  ].join('\n')

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

export const formatCheckPart = (p: PartCheck, s: CheckSettings) => {
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
  const w = p.walls
  lines.push(
    row(
      w.status,
      'walls',
      w.regions.length
        ? `${num(w.area)} mm2 thinner than ${num(s.minWall)} mm in ${w.regions.length} region(s), thinnest ${num(w.worst ?? 0)} mm (nozzle ${num(s.nozzle)})`
        : `nothing thinner than ${num(s.minWall)} mm`,
    ),
    ...formatRegions(w.regions, w.regions.length, (r) => `${num(r.worst)} mm`),
  )
  const bodies = p.bodies
  lines.push(
    row(
      bodies.status,
      'bodies',
      `${bodies.bodies} solid${bodies.bodies === 1 ? '' : 's'}${bodies.voids ? `, ${bodies.voids} enclosed void(s)` : ''}${bodies.floating.length ? `, ${bodies.floating.length} floating above the bed` : ''}${bodies.small.length ? `, ${bodies.small.length} smaller than ${num(s.minWall)} mm` : ''}`,
    ),
    ...bodies.floating.slice(0, MAX_LISTED).map((x) => `           - floating ${formatBody(x)}`),
    ...bodies.small.slice(0, MAX_LISTED).map((x) => `           - small ${formatBody(x)}`),
  )
  return lines.join('\n')
}

export const formatCheck = (r: CheckResult) => {
  const s = r.settings
  return [
    `${LABEL[r.status]}  ${r.project}  bed ${s.bed.map(num).join(' x ')} mm, nozzle ${num(s.nozzle)} mm, overhang > ${num(s.overhangAngle)} deg, min wall ${num(s.minWall)} mm`,
    ...r.parts.map((p) => formatCheckPart(p, s)),
  ].join('\n')
}
