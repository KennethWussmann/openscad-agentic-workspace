import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseModelXml, read3mf, readZip } from '../index.ts'
import { tempPaths } from './helpers.ts'

const zip = (files: Record<string, string>, deflate: boolean) => {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content)
    const data = deflate ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const TRIANGLE = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model"><mesh>
      <vertices><vertex x="0" y="0" z="0" /><vertex x="1" y="0" z="0" /><vertex x="0" y="1" z="0" /></vertices>
      <triangles><triangle v1="0" v2="1" v3="2" pid="1" pindex="0" /></triangles>
    </mesh></object>
    <object id="2" type="model"><components>
      <component objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0" />
    </components></object>
  </resources>
  <build>
    <item objectid="1" />
    <item objectid="2" transform="0 1 0 -1 0 0 0 0 1 0 0 5" />
  </build>
</model>`

describe('3MF reading', () => {
  it('reads stored and deflated zip entries', () => {
    for (const deflate of [false, true]) {
      const files = readZip(zip({ 'a.txt': 'hello', '3D/3dmodel.model': 'model' }, deflate))
      expect(files.get('a.txt')?.toString()).toBe('hello')
      expect(files.get('3D/3dmodel.model')?.toString()).toBe('model')
    }
  })

  it('merges build items and applies component and item transforms', () => {
    const mesh = parseModelXml(TRIANGLE)
    expect([...mesh.index]).toEqual([0, 1, 2, 3, 4, 5])
    expect([...mesh.positions.slice(0, 9)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect([...mesh.positions.slice(9)].map((v) => Math.round(v * 1000) / 1000)).toEqual([
      0, 10, 5, 0, 11, 5, -1, 10, 5,
    ])
  })

  it('reads a model from a .3mf file', () => {
    const paths = tempPaths('mesh3mf')
    const file = path.join(paths.workspace, 'part.3mf')
    writeFileSync(file, zip({ '[Content_Types].xml': '<Types/>', '3D/3dmodel.model': TRIANGLE }, true))
    expect(read3mf(file).index.length).toBe(6)
  })
})
