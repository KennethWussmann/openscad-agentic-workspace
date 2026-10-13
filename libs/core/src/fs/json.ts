import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const sha1 = (file: string) => createHash('sha1').update(readFileSync(file)).digest('hex')

export const writeJsonAtomic = (file: string, data: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, file)
}

export const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}
