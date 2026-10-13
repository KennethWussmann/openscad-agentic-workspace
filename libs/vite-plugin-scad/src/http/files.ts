import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { isInside, type Paths, projectLayout } from '@scad/core'
import { json, type Res } from './respond.ts'

const SERVED = ['preview/', 'versions/', 'temp/tweak/', 'out/', 'proposals/']
const TYPES: Record<string, string> = {
  '.3mf': 'model/3mf',
  '.png': 'image/png',
  '.json': 'application/json',
  '.stl': 'model/stl',
}

export const serveFile = (paths: Paths, res: Res, project: string, rel: string) => {
  const layout = projectLayout(paths, project)
  const file = path.resolve(layout.dir, rel)
  if (!SERVED.some((prefix) => rel.startsWith(prefix)) || !isInside(layout.dir, file) || !existsSync(file))
    return json(res, 404, { error: 'not found' })
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', statSync(file).size)
  res.end(readFileSync(file))
}
