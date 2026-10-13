import { describe, expect, it } from 'vitest'
import { partResult, project, renderResult, version } from '../../test/fixtures.ts'
import { annotationSource, modelSource } from './source.ts'

const tweak = renderResult({ finishedAt: 'tweak-time', parts: [partResult({ model: 'preview/tweak/main.3mf' })] })

describe('modelSource', () => {
  it('shows the selected version', () => {
    const p = project({ versions: [version()] })
    expect(modelSource(p, 'v1', false)).toEqual({ kind: 'version', stamp: 'v1', parts: version().parts })
    expect(modelSource(p, 'v9', false)).toBeNull()
  })

  it('shows the tweak while tweaking and a tweak model exists', () => {
    expect(modelSource(project({ tweak }), null, true)).toMatchObject({ kind: 'tweak', stamp: 'tweak-time' })
    const empty = renderResult({ parts: [partResult({ model: null })] })
    expect(modelSource(project({ tweak: empty }), null, true)?.kind).toBe('working')
  })

  it('shows the working render otherwise', () => {
    expect(modelSource(project({ tweak }), null, false)).toEqual({
      kind: 'working',
      stamp: renderResult().finishedAt,
      parts: [{ id: 'main', model: 'preview/main.3mf' }],
    })
    expect(modelSource(project({ render: null }), null, false)).toBeNull()
  })
})

describe('annotationSource', () => {
  it('references what the user annotated', () => {
    expect(annotationSource(project({ versions: [version()] }), 'v1', {})).toEqual({
      kind: 'version',
      version: 'v1',
      render: null,
    })
    expect(annotationSource(project({ tweak }), null, { width: 30 })).toEqual({
      kind: 'tweak',
      version: null,
      render: 'tweak-time',
      params: { width: 30 },
    })
    expect(annotationSource(project(), null, {})).toEqual({
      kind: 'working',
      version: null,
      render: renderResult().finishedAt,
    })
    expect(annotationSource(project({ render: null }), null, {})).toEqual({
      kind: 'working',
      version: null,
      render: null,
    })
  })
})
