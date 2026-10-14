import { describe, expect, it } from 'vitest'
import { project, renderResult, version } from '../test/fixtures.ts'
import { DISPLAY_KEY, SIDEBAR_KEY } from './persist.ts'
import { selectOverrides, useStore } from './store.ts'

const s = () => useStore.getState()

const note = {
  kind: 'face' as const,
  point: [0, 0, 0] as [number, number, number],
  normal: [0, 0, 1] as [number, number, number],
  part: { id: 'main', file: null, mesh: 0, color: '#fff' },
  surface: null,
  source: { kind: 'working' as const, version: null, render: null },
}

describe('projects', () => {
  it('resets view state when switching to another project', () => {
    s().setProject(project({ id: 'a' }))
    s().togglePart('main')
    s().setEdit('width', 30)
    s().addPoint([0, 0, 0])
    s().addNote(note)
    const fit = s().fitToken
    s().setProject(project({ id: 'b' }))
    expect(s()).toMatchObject({ hidden: [], edits: {}, pending: null, notes: [], editing: null })
    expect(s().fitToken).toBe(fit + 1)
  })

  it('keeps view state when the same project refreshes', () => {
    s().setProject(project())
    s().setEdit('width', 30)
    const fit = s().fitToken
    s().setProject(project({ rendering: true }))
    expect(s().edits).toEqual({ width: 30 })
    expect(s().rendering.preview).toBe(true)
    expect(s().fitToken).toBe(fit)
  })

  it('selects sets as the tweak baseline and folds a vanished set into plain edits', () => {
    const params = [
      { name: 'width', type: 'number' as const, initial: 20 },
      { name: 'depth', type: 'number' as const, initial: 10 },
    ]
    const withSet = project({
      sets: { tray: { values: { width: 40, depth: 10 }, export: false } },
      render: renderResult({ params }),
    })
    s().setProject(withSet)
    s().setEdit('width', 30)
    s().selectSet('tray')
    expect(s()).toMatchObject({ activeSet: 'tray', edits: {} })
    expect(selectOverrides(s())).toEqual({ width: 40, depth: 10 })
    s().setEdit('depth', 12)
    expect(selectOverrides(s())).toEqual({ width: 40, depth: 12 })
    s().setProject({ ...withSet, sets: {} })
    expect(s()).toMatchObject({ activeSet: null, edits: { width: 40, depth: 12 } })
    s().setProject(project({ id: 'other' }))
    expect(s().activeSet).toBeNull()
  })

  it('drops a selected version or ghost that no longer exists', () => {
    s().setProject(project({ versions: [version(), version({ id: 'v2', index: 2 })] }))
    s().setVersion('v2')
    s().setGhost('v1')
    s().setProject(project({ versions: [version({ id: 'v2', index: 2 })] }))
    expect(s().versionId).toBe('v2')
    expect(s().ghostId).toBeNull()
  })

  it('stores errors and mirrors rendering and exporting flags', () => {
    s().setProject(null, 'boom')
    expect(s().error).toBe('boom')
    s().setProject(project({ rendering: true, exporting: true }))
    expect(s()).toMatchObject({ error: null, exporting: true, rendering: { preview: true, tweak: false } })
  })

  it('writes the selected project to the url', () => {
    s().selectProject('box')
    expect(s().projectId).toBe('box')
    expect(location.search).toBe('?project=box')
    s().selectProject(null)
    expect(location.search).toBe('')
  })
})

describe('versions', () => {
  it('clears the ghost when it becomes the shown version', () => {
    s().setGhost('v1')
    s().setVersion('v1')
    expect(s().ghostId).toBeNull()
    s().setGhost('v2')
    s().setVersion(null)
    expect(s().ghostId).toBe('v2')
  })
})

describe('display', () => {
  it('toggles and persists display flags', () => {
    s().toggleDisplay('xray')
    expect(s().display.xray).toBe(true)
    expect(JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? '{}')).toMatchObject({ xray: true })
  })

  it('shows only one analysis at a time', () => {
    s().toggleDisplay('overhangs')
    s().toggleDisplay('walls')
    expect(s().display).toMatchObject({ walls: true, overhangs: false })
    s().toggleDisplay('overhangs')
    expect(s().display).toMatchObject({ walls: false, overhangs: true })
  })

  it('persists the sidebar state', () => {
    s().toggleSidebar()
    expect(s().sidebar).toBe(false)
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('closed')
  })

  it('writes embed mode to the url', () => {
    s().toggleEmbed()
    expect(s().embed).toBe(true)
    expect(location.search).toBe('?embed=1')
    s().toggleEmbed()
    expect(location.search).toBe('')
  })
})

describe('parts', () => {
  it('toggles part visibility', () => {
    s().togglePart('a')
    s().togglePart('b')
    s().togglePart('a')
    expect(s().hidden).toEqual(['b'])
  })
})

describe('measure', () => {
  it('pairs points into measurements', () => {
    s().addPoint([0, 0, 0])
    expect(s().pending).toEqual([0, 0, 0])
    s().addPoint([1, 2, 3])
    expect(s().pending).toBeNull()
    expect(s().measures).toMatchObject([{ a: [0, 0, 0], b: [1, 2, 3] }])
    s().clearMeasures()
    expect(s().measures).toEqual([])
  })

  it('drops the pending point when the tool changes', () => {
    s().addPoint([0, 0, 0])
    s().setTool('annotate')
    expect(s().pending).toBeNull()
    expect(s().tool).toBe('annotate')
  })
})

describe('notes', () => {
  it('opens new notes in the editor and discards the empty one being edited', () => {
    s().addNote(note)
    const first = s().editing
    s().addNote(note)
    expect(s().notes).toHaveLength(1)
    expect(s().editing).not.toBe(first)
  })

  it('keeps notes with text when another note is edited', () => {
    s().addNote(note)
    const first = s().editing as number
    s().updateNote(first, 'thicker')
    s().addNote(note)
    const second = s().editing as number
    s().editNote(first)
    expect(s().notes.map((n) => n.id)).toEqual([first])
    s().updateNote(first, 'thicker wall')
    expect(s().notes[0].text).toBe('thicker wall')
    expect(second).toBeGreaterThan(first)
  })

  it('closes the editor and removes notes', () => {
    s().addNote(note)
    const id = s().editing as number
    s().updateNote(id, 'keep')
    s().closeEditor()
    expect(s().editing).toBeNull()
    expect(s().notes).toHaveLength(1)
    s().editNote(id)
    s().removeNote(id)
    expect(s()).toMatchObject({ notes: [], editing: null })
  })

  it('clears all notes', () => {
    s().addNote(note)
    s().clearNotes()
    expect(s()).toMatchObject({ notes: [], editing: null })
  })
})

describe('edits', () => {
  it('sets, removes and resets parameter edits', () => {
    s().setEdit('width', 30)
    s().setEdit('label', 'hi')
    s().setEdit('width', undefined)
    expect(s().edits).toEqual({ label: 'hi' })
    s().resetEdits()
    expect(s().edits).toEqual({})
  })
})

describe('derived viewer state', () => {
  it('only updates bounds and analysis when they change', () => {
    s().setBounds([
      [0, 0, 0],
      [1, 1, 1],
    ])
    const bounds = s().bounds
    s().setBounds([
      [0, 0, 0],
      [1, 1, 1],
    ])
    expect(s().bounds).toBe(bounds)
    const analysis = { mode: 'walls' as const, busy: false, area: 1, extreme: 0.4 }
    s().setAnalysis(analysis)
    s().setAnalysis({ ...analysis })
    expect(s().analysis).toBe(analysis)
  })

  it('numbers export notices', () => {
    s().showExportNotice({ result: null, error: 'nope' })
    const first = s().exportNotice?.id ?? 0
    s().showExportNotice({ result: null, error: 'again' })
    expect(s().exportNotice?.id).toBe(first + 1)
    s().dismissExportNotice()
    expect(s().exportNotice).toBeNull()
  })
})
