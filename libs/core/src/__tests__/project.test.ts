import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { RenderResult } from '@scad/protocol'
import { describe, expect, it } from 'vitest'
import {
  checkpoint,
  createProject,
  isDirty,
  listProjects,
  listVersions,
  projectLayout,
  projectState,
  restoreFiles,
  sha1,
  writeJsonAtomic,
} from '../index.ts'
import { tempPaths, write } from './helpers.ts'

const fakeRender = (paths: ReturnType<typeof tempPaths>, id: string, files: string[]) => {
  const layout = projectLayout(paths, id)
  write(path.join(layout.preview, 'main.3mf'), `model ${Date.now()}`)
  const result: RenderResult = {
    project: id,
    status: 'ok',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
    overrides: {},
    parts: [
      {
        id: 'main',
        file: 'src/main.scad',
        status: 'ok',
        model: 'preview/main.3mf',
        stale: false,
        bbox: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1] },
        facets: 12,
        vertices: 8,
        durationMs: 1,
        diagnostics: [],
      },
    ],
    params: [{ name: 'width', type: 'number', initial: 40 }],
    inputs: files.map((f) => ({ path: path.relative(paths.workspace, f).split(path.sep).join('/'), sha: sha1(f) })),
  }
  writeJsonAtomic(layout.renderFile, result)
}

describe('projects', () => {
  it('bootstraps the layout with a parametric template', () => {
    const paths = tempPaths('project-new')
    const layout = createProject({ paths, id: 'desk-hook', description: 'A hook' })
    for (const p of [
      layout.config,
      layout.brief,
      path.join(layout.src, 'main.scad'),
      layout.preview,
      layout.out,
      layout.versions,
    ])
      expect(existsSync(p)).toBe(true)
    expect(readFileSync(path.join(layout.src, 'main.scad'), 'utf8')).toContain('/* [Dimensions] */')
    expect(listProjects(paths).map((p) => [p.id, p.name, p.status])).toEqual([['desk-hook', 'Desk Hook', 'unrendered']])
    expect(() => createProject({ paths, id: 'desk-hook' })).toThrow(/exists/)
    expect(() => createProject({ paths, id: 'Bad Id' })).toThrow(/Invalid/)
  })

  it('copies another project with --from and renames it', () => {
    const paths = tempPaths('project-from')
    createProject({ paths, id: 'a', name: 'Alpha' })
    const b = createProject({ paths, id: 'b', from: 'a', name: 'Beta' })
    expect(readFileSync(b.config, 'utf8')).toContain('name: Beta')
    expect(existsSync(path.join(b.src, 'main.scad'))).toBe(true)
  })
})

describe('versions', () => {
  it('checkpoints, detects changes, refuses stale renders and restores', () => {
    const paths = tempPaths('versions')
    const layout = createProject({ paths, id: 'box' })
    const main = path.join(layout.src, 'main.scad')
    const lib = path.join(paths.libs, 'shared', 'shared.scad')
    write(lib, 'module a() {}\n')
    fakeRender(paths, 'box', [main, lib, layout.config])

    expect(isDirty(paths, 'box')).toBe(true)
    const v1 = checkpoint({ paths, project: 'box', message: 'First' })
    expect(v1.id).toBe('v001')
    expect(v1.params).toEqual({ width: 40 })
    expect(existsSync(path.join(layout.versions, 'v001', 'src', 'main.scad'))).toBe(true)
    expect(existsSync(path.join(layout.versions, 'v001', 'libs', 'shared', 'shared.scad'))).toBe(true)
    expect(existsSync(path.join(layout.versions, 'v001', 'preview', 'main.3mf'))).toBe(true)
    expect(isDirty(paths, 'box')).toBe(false)
    expect(() => checkpoint({ paths, project: 'box', message: 'Same' })).toThrow(/Nothing changed/)

    writeFileSync(main, 'cube(2);\n')
    expect(() => checkpoint({ paths, project: 'box', message: 'Stale' })).toThrow(/Render again/)
    fakeRender(paths, 'box', [main, lib, layout.config])
    const v2 = checkpoint({ paths, project: 'box', message: 'Second' })
    expect(v2.id).toBe('v002')

    writeFileSync(lib, 'module a() { cube(1); }\n')
    const restored = restoreFiles(paths, 'box', 'v001')
    expect(restored.version.id).toBe('v001')
    expect(readFileSync(main, 'utf8')).toContain('rounded_block')
    expect(restored.libsDiffer).toEqual(['_libs/shared/shared.scad'])
    const again = restoreFiles(paths, 'box', 'v1', true)
    expect(again.libsRestored).toEqual(['_libs/shared/shared.scad'])
    expect(readFileSync(lib, 'utf8')).toBe('module a() {}\n')

    expect(listVersions(paths, 'box').map((v) => v.id)).toEqual(['v001', 'v002'])
    expect(projectState(paths, 'box').versions).toHaveLength(2)
    expect(() => restoreFiles(paths, 'box', 'v009')).toThrow(/not found/)
  })
})
