import { readFileSync, writeFileSync } from 'node:fs'
import { readZip, writeZip } from './zip.ts'

export type MeshData = {
  positions: Float64Array
  index: Uint32Array
}

type Matrix = number[]

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

const parseMatrix = (attr: string | undefined): Matrix => {
  if (!attr) return IDENTITY
  const m = attr.trim().split(/\s+/).map(Number)
  return m.length === 12 && m.every(Number.isFinite) ? m : IDENTITY
}

const multiply = (a: Matrix, b: Matrix): Matrix => {
  const out = new Array<number>(12)
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      out[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c] + (r === 3 ? b[9 + c] : 0)
  return out
}

const attrs = (tag: string) => {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

type ObjectDef = {
  vertices: number[]
  triangles: number[]
  components: { id: string; transform: Matrix }[]
}

export const parseModelXml = (xml: string): MeshData => {
  const objects = new Map<string, ObjectDef>()
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = attrs(m[1]).id
    const body = m[2]
    const vertices: number[] = []
    for (const v of body.matchAll(/<vertex\b([^>]*)\/>/g)) {
      const a = attrs(v[1])
      vertices.push(Number(a.x), Number(a.y), Number(a.z))
    }
    const triangles: number[] = []
    for (const t of body.matchAll(/<triangle\b([^>]*)\/>/g)) {
      const a = attrs(t[1])
      triangles.push(Number(a.v1), Number(a.v2), Number(a.v3))
    }
    const components = [...body.matchAll(/<component\b([^>]*)\/>/g)].map((c) => {
      const a = attrs(c[1])
      return { id: a.objectid, transform: parseMatrix(a.transform) }
    })
    objects.set(id, { vertices, triangles, components })
  }
  const items = [...xml.matchAll(/<item\b([^>]*)\/>/g)].map((m) => {
    const a = attrs(m[1])
    return { id: a.objectid, transform: parseMatrix(a.transform) }
  })
  const positions: number[] = []
  const index: number[] = []
  const emit = (id: string, transform: Matrix, depth: number) => {
    const obj = objects.get(id)
    if (!obj || depth > 8) return
    const base = positions.length / 3
    for (let i = 0; i < obj.vertices.length; i += 3) {
      const [x, y, z] = [obj.vertices[i], obj.vertices[i + 1], obj.vertices[i + 2]]
      const m = transform
      positions.push(
        x * m[0] + y * m[3] + z * m[6] + m[9],
        x * m[1] + y * m[4] + z * m[7] + m[10],
        x * m[2] + y * m[5] + z * m[8] + m[11],
      )
    }
    for (const t of obj.triangles) index.push(base + t)
    for (const c of obj.components) emit(c.id, multiply(c.transform, transform), depth + 1)
  }
  for (const item of items.length ? items : [...objects.keys()].map((id) => ({ id, transform: IDENTITY })))
    emit(item.id, item.transform, 0)
  return { positions: Float64Array.from(positions), index: Uint32Array.from(index) }
}

const modelEntry = (files: Map<string, Buffer>, file: string) => {
  const model = [...files.keys()].find((name) => /\.model$/i.test(name) && /^3D\//i.test(name))
  if (!model) throw new Error(`No 3D model found in ${file}`)
  return model
}

export const read3mf = (file: string): MeshData => {
  const files = readZip(readFileSync(file))
  return parseModelXml((files.get(modelEntry(files, file)) as Buffer).toString('utf8'))
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const nameModelXml = (xml: string, name: string) => {
  const escaped = escapeXml(name)
  const count = [...xml.matchAll(/<object\b[^>]*\bname="/g)].length
  let n = 0
  return xml
    .replace(
      /(<metadata\b[^>]*\bname="Title"[^>]*>)[^<]*(<\/metadata>)/,
      (_, open, close) => `${open}${escaped}${close}`,
    )
    .replace(/(<object\b[^>]*\bname=")[^"]*"/g, (_, head) => `${head}${escaped}${count > 1 ? ` ${++n}` : ''}"`)
}

export const name3mf = (file: string, name: string) => {
  const files = readZip(readFileSync(file))
  const model = modelEntry(files, file)
  files.set(model, Buffer.from(nameModelXml((files.get(model) as Buffer).toString('utf8'), name)))
  writeFileSync(file, writeZip(files))
}
