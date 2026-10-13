import { existsSync, readFileSync } from 'node:fs'
import type { Annotation, AnnotationInput } from '@scad/protocol'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  clearAnnotations,
  clearProposals,
  createProject,
  listProjects,
  projectLayout,
  projectState,
  readAnnotations,
  writeAnnotations,
  writeParamProposal,
} from '../index.ts'
import { tempPaths } from './helpers.ts'

const png = () => `data:image/png;base64,${PNG.sync.write(new PNG({ width: 2, height: 2 })).toString('base64')}`

const annotation = (text: string): Annotation => ({
  n: 7,
  text,
  kind: 'face',
  point: [12, 5, 10],
  normal: [0, 0, 1],
  part: { id: 'main', file: 'src/main.scad', mesh: 0, color: '#b8c4d0' },
  surface: null,
  source: { kind: 'working', version: null, render: '2026-01-01T00:00:00.000Z' },
})

const input = (patch: Partial<AnnotationInput> = {}): AnnotationInput => ({
  source: { kind: 'working', version: null, render: '2026-01-01T00:00:00.000Z' },
  camera: { position: [100, -100, 80], target: [0, 0, 0], up: [0, 0, 1], projection: 'perspective' },
  section: null,
  annotations: [annotation('  make this hole bigger  '), annotation('round this edge')],
  snapshot: png(),
  ...patch,
})

describe('annotation proposals', () => {
  it('stores annotations with the snapshot and renumbers them', () => {
    const paths = tempPaths('annotations-write')
    createProject({ paths, id: 'box' })
    const proposal = writeAnnotations(paths, 'box', input({ note: ' overall ' }), 'v002')
    const layout = projectLayout(paths, 'box')
    expect(proposal.snapshot).toBe('proposals/annotations.png')
    expect(readFileSync(layout.annotationsSnapshot).subarray(1, 4).toString()).toBe('PNG')
    const stored = readAnnotations(paths, 'box')
    expect(stored?.basedOn).toBe('v002')
    expect(stored?.note).toBe('overall')
    expect(stored?.annotations.map((a) => [a.n, a.text])).toEqual([
      [1, 'make this hole bigger'],
      [2, 'round this edge'],
    ])
    expect(JSON.stringify(stored)).not.toContain('base64')
  })

  it('rejects empty notes, bad coordinates and non-PNG snapshots', () => {
    const paths = tempPaths('annotations-invalid')
    createProject({ paths, id: 'box' })
    expect(() => writeAnnotations(paths, 'box', input({ annotations: [] }), null)).toThrow(/no annotations/)
    expect(() => writeAnnotations(paths, 'box', input({ annotations: [annotation('   ')] }), null)).toThrow(/text/)
    const bad = { ...annotation('x'), point: [1, Number.NaN, 2] }
    expect(() => writeAnnotations(paths, 'box', { ...input(), annotations: [bad] }, null)).toThrow(/point/)
    expect(() => writeAnnotations(paths, 'box', input({ snapshot: 'data:image/jpeg;base64,AAAA' }), null)).toThrow(
      /PNG/,
    )
    expect(() => writeAnnotations(paths, 'box', input({ snapshot: 'data:image/png;base64,AAAA' }), null)).toThrow(
      /not a PNG/,
    )
    expect(existsSync(projectLayout(paths, 'box').annotations)).toBe(false)
  })

  it('keeps parameter and annotation proposals independent', () => {
    const paths = tempPaths('annotations-state')
    createProject({ paths, id: 'box' })
    expect(listProjects(paths)[0].proposal).toBe(false)
    writeParamProposal(paths, 'box', { params: { width: 50 }, createdAt: 'now', basedOn: null })
    writeAnnotations(paths, 'box', input(), null)
    const state = projectState(paths, 'box')
    expect(state.proposals.params?.params).toEqual({ width: 50 })
    expect(state.proposals.annotations?.annotations).toHaveLength(2)
    clearAnnotations(paths, 'box')
    expect(existsSync(projectLayout(paths, 'box').annotationsSnapshot)).toBe(false)
    expect(projectState(paths, 'box').proposals.params).not.toBeNull()
    expect(listProjects(paths)[0].proposal).toBe(true)
    clearProposals(paths, 'box')
    expect(projectState(paths, 'box').proposals).toEqual({ params: null, annotations: null })
    expect(listProjects(paths)[0].proposal).toBe(false)
  })
})
