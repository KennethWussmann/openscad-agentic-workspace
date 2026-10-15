import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

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

export const writeZip = (files: Map<string, Buffer>) => {
  const chunks: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, raw] of files) {
    const data = deflateRawSync(raw)
    const nameBuf = Buffer.from(name)
    const crc = crc32(raw)
    if (offset + 30 + nameBuf.length + data.length > MAX32) throw new Error('Zip archive too large')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0x0021, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0x0021, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    chunks.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(EOCD, 0)
  end.writeUInt16LE(files.size, 8)
  end.writeUInt16LE(files.size, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, directory, end])
}
