import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Paths } from '../workspace/paths.ts'

export type LocalLibrary = {
  name: string
  dir: string
  summary: string
}

const firstLine = (dir: string) => {
  const readme = path.join(dir, 'README.md')
  if (!existsSync(readme)) return ''
  return (
    readFileSync(readme, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#')) ?? ''
  )
}

export const listLocalLibraries = (paths: Paths): LocalLibrary[] =>
  existsSync(paths.libs)
    ? readdirSync(paths.libs, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => ({
          name: d.name,
          dir: path.join(paths.libs, d.name),
          summary: firstLine(path.join(paths.libs, d.name)),
        }))
    : []

const LOCAL_NAME = /^[a-z0-9][a-z0-9_-]*$/

export const libraryTemplate = (name: string) => `// ${name}: shared OpenSCAD library.
// Import with: use <${name}/${name}.scad>
// All dimensions in millimetres. Modules take explicit parameters, no globals.

// Returns the value clamped into [lo, hi].
function ${name.replace(/-/g, '_')}_clamp(v, lo, hi) = min(max(v, lo), hi);
`

export const createLocalLibrary = (paths: Paths, name: string, summary = '') => {
  if (!LOCAL_NAME.test(name)) throw new Error(`Invalid library name "${name}": use lowercase letters, digits, - and _`)
  const dir = path.join(paths.libs, name)
  if (existsSync(dir)) throw new Error(`Library "${name}" already exists`)
  mkdirSync(path.join(dir, 'examples'), { recursive: true })
  writeFileSync(path.join(dir, `${name}.scad`), libraryTemplate(name))
  writeFileSync(
    path.join(dir, 'README.md'),
    `# ${name}\n\n${summary || 'What this library provides.'}\n\n## Usage\n\n\`\`\`openscad\nuse <${name}/${name}.scad>\n\`\`\`\n\n## Modules and functions\n\n| Name | Purpose |\n| --- | --- |\n`,
  )
  writeFileSync(
    path.join(dir, 'examples', 'demo.scad'),
    `use <${name}/${name}.scad>\n\necho(${name.replace(/-/g, '_')}_clamp(5, 0, 3));\ncube(10);\n`,
  )
  return dir
}
