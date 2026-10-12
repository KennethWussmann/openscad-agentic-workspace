import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

export type MeshData = {
  positions: Float64Array
  index: Uint32Array
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const EOCD64 = 0x06064b50
const EOCD64_LOCATOR = 0x07064b50
const ZIP64_EXTRA = 0x0001
const MAX32 = 0xffffffff
const MAX16 = 0xffff

const zip64Fields = (buf: Buffer, start: number, end: number, wanted: boolean[]) => {
  const values: number[] = []
  for (let at = start; at + 4 <= end; ) {
    const id = buf.readUInt16LE(at)
    const len = buf.readUInt16LE(at + 2)
    if (id === ZIP64_EXTRA) {
      let off = at + 4
      for (const want of wanted) {
        if (!want) continue
        values.push(Number(buf.readBigUInt64LE(off)))
        off += 8
      }
      return values
    }
    at += 4 + len
  }
  return values
}

export const readZip = (buf: Buffer) => {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--)
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('Not a zip archive')
  let entries = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  if ((entries === MAX16 || offset === MAX32) && eocd >= 20 && buf.readUInt32LE(eocd - 20) === EOCD64_LOCATOR) {
    const record = Number(buf.readBigUInt64LE(eocd - 12))
    if (buf.readUInt32LE(record) !== EOCD64) throw new Error('Corrupt zip64 end of central directory')
    entries = Number(buf.readBigUInt64LE(record + 32))
    offset = Number(buf.readBigUInt64LE(record + 48))
  }
  const files = new Map<string, Buffer>()
  for (let e = 0; e < entries; e++) {
    if (buf.readUInt32LE(offset) !== CENTRAL) throw new Error('Corrupt zip central directory')
    const method = buf.readUInt16LE(offset + 10)
    let size = buf.readUInt32LE(offset + 20)
    const rawSize = buf.readUInt32LE(offset + 24)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    let local = buf.readUInt32LE(offset + 42)
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen)
    const wanted = [rawSize === MAX32, size === MAX32, local === MAX32]
    if (wanted.some(Boolean)) {
      const extraStart = offset + 46 + nameLen
      const values = zip64Fields(buf, extraStart, extraStart + extraLen, wanted)
      let i = wanted[0] ? 1 : 0
      if (wanted[1]) size = values[i++]
      if (wanted[2]) local = values[i]
    }
    offset += 46 + nameLen + extraLen + commentLen
    if (buf.readUInt32LE(local) !== LOCAL) throw new Error(`Corrupt zip entry ${name}`)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + size)
    if (method === 0) files.set(name, data)
    else if (method === 8) files.set(name, inflateRawSync(data))
    else throw new Error(`Unsupported zip compression ${method} in ${name}`)
  }
  return files
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

export const read3mf = (file: string): MeshData => {
  const files = readZip(readFileSync(file))
  const model = [...files.keys()].find((name) => /\.model$/i.test(name) && /^3D\//i.test(name))
  if (!model) throw new Error(`No 3D model found in ${file}`)
  return parseModelXml((files.get(model) as Buffer).toString('utf8'))
}
