import type { ThreeEvent } from '@react-three/fiber'
import { analyzeSurface, buildTopology, describeEdge, featureEdgesNear, point, type Topology } from '@scad/geometry'
import type { AnnotationEdge, AnnotationPart, PartDef } from '@scad/protocol'
import { type BufferGeometry, type Intersection, type Mesh, Vector2, Vector3 } from 'three'
import { toVec3 } from '../../lib/vec.ts'
import type { NoteDraft } from '../../store/store.ts'
import { sectionPlane } from '../section/plane.ts'

const VERTEX_SNAP_PX = 10
const EDGE_SNAP_PX = 8
const CORNER_COS = Math.cos(Math.PI / 6)

export type PartMeshData = { partId: string; mesh: number; color: string }

const topologies = new WeakMap<BufferGeometry, Topology>()

const topologyOf = (geometry: BufferGeometry) => {
  let topo = topologies.get(geometry)
  if (!topo) {
    topo = buildTopology(geometry.getAttribute('position').array, geometry.getIndex()?.array ?? null)
    topologies.set(geometry, topo)
  }
  return topo
}

const firstHit = (e: ThreeEvent<MouseEvent>, sectionOn: boolean) =>
  e.intersections.find(
    (i) =>
      (i.object as Mesh).isMesh &&
      i.object.userData.partId !== undefined &&
      (!sectionOn || sectionPlane.distanceToPoint(i.point) >= -1e-4),
  )

const screen = (e: ThreeEvent<MouseEvent>) => {
  const { width, height } = (e.nativeEvent.target as HTMLElement).getBoundingClientRect()
  const pointer = new Vector2(e.pointer.x, e.pointer.y)
  const toPx = (p: Vector3) => {
    const ndc = p.clone().project(e.camera)
    return new Vector2((ndc.x * width) / 2, (ndc.y * height) / 2)
  }
  return { pointer: new Vector2((pointer.x * width) / 2, (pointer.y * height) / 2), toPx }
}

const snapVertex = (e: ThreeEvent<MouseEvent>, hit: Intersection) => {
  if (!hit.face) return null
  const pos = ((hit.object as Mesh).geometry as BufferGeometry).getAttribute('position')
  const { pointer, toPx } = screen(e)
  let best: Vector3 | null = null
  let bestDist = VERTEX_SNAP_PX
  for (const idx of [hit.face.a, hit.face.b, hit.face.c]) {
    const vtx = new Vector3().fromBufferAttribute(pos, idx).applyMatrix4(hit.object.matrixWorld)
    const d = toPx(vtx).distanceTo(pointer)
    if (d < bestDist) {
      bestDist = d
      best = vtx
    }
  }
  return best
}

export const pickPoint = (e: ThreeEvent<MouseEvent>, sectionOn: boolean): Vector3 | null => {
  const hit = firstHit(e, sectionOn)
  if (!hit) return null
  return snapVertex(e, hit) ?? hit.point.clone()
}

const snapEdge = (e: ThreeEvent<MouseEvent>, topo: Topology, edges: [number, number][]) => {
  const { pointer, toPx } = screen(e)
  let best: { a: number; b: number; at: Vector3 } | null = null
  let bestDist = EDGE_SNAP_PX
  for (const [a, b] of edges) {
    const pa = new Vector3(...point(topo, a))
    const pb = new Vector3(...point(topo, b))
    const sa = toPx(pa)
    const seg = toPx(pb).sub(sa)
    const lenSq = seg.lengthSq()
    const t = lenSq > 0 ? Math.max(0, Math.min(1, pointer.clone().sub(sa).dot(seg) / lenSq)) : 0
    const d = sa.clone().addScaledVector(seg, t).distanceTo(pointer)
    if (d < bestDist) {
      bestDist = d
      best = { a, b, at: pa.lerp(pb, t) }
    }
  }
  return best
}

const isCorner = (topo: Topology, edges: [number, number][], v: Vector3) => {
  const dirs = edges.flatMap(([a, b]) => {
    const pa = new Vector3(...point(topo, a))
    const pb = new Vector3(...point(topo, b))
    if (pa.distanceTo(v) < 1e-5) return [pb.sub(pa).normalize()]
    if (pb.distanceTo(v) < 1e-5) return [pa.sub(pb).normalize()]
    return []
  })
  return dirs.some((d, i) => dirs.some((f, j) => j > i && d.dot(f) > -CORNER_COS))
}

export const pickNote = (
  e: ThreeEvent<MouseEvent>,
  sectionOn: boolean,
  parts: PartDef[],
  source: NoteDraft['source'],
): Omit<NoteDraft, 'id' | 'text'> | null => {
  const hit = firstHit(e, sectionOn)
  if (!hit?.face || hit.faceIndex == null) return null
  const mesh = hit.object as Mesh
  const data = mesh.userData as PartMeshData
  const topo = topologyOf(mesh.geometry as BufferGeometry)
  const triangle = hit.faceIndex
  const normal = toVec3(hit.face.normal.clone().transformDirection(mesh.matrixWorld))
  const part: AnnotationPart = {
    id: data.partId,
    file: parts.find((p) => p.id === data.partId)?.file ?? null,
    mesh: data.mesh,
    color: data.color,
  }
  const surface = analyzeSurface(topo, triangle)
  const edges = featureEdgesNear(topo, triangle)
  const vertex = snapVertex(e, hit)
  if (vertex && isCorner(topo, edges, vertex))
    return { kind: 'vertex', point: toVec3(vertex), normal, part, surface, source }
  const near = snapEdge(e, topo, edges)
  if (near) {
    const edge: AnnotationEdge = describeEdge(topo, near.a, near.b)
    return { kind: 'edge', point: toVec3(near.at), normal, part, edge, surface, source }
  }
  return { kind: 'face', point: toVec3(hit.point), normal, part, surface, source }
}
