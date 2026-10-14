import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client.ts'
import type { ServerHandlers } from '../api/events.ts'
import { useStore } from '../store/store.ts'
import { project, renderResult, summary } from '../test/fixtures.ts'
import { useServer } from './useServer.ts'

const events = vi.hoisted(() => ({ handlers: null as ServerHandlers | null, announced: [] as (string | null)[] }))

vi.mock('../api/events.ts', () => ({
  connect: (handlers: ServerHandlers) => {
    events.handlers = handlers
    return () => {
      events.handlers = null
    }
  },
  announce: (project: string | null) => events.announced.push(project),
}))

const Server = () => {
  useServer()
  return null
}

const on = () => events.handlers as ServerHandlers
const s = () => useStore.getState()

beforeEach(() => {
  events.announced = []
  vi.spyOn(api, 'projects').mockResolvedValue([summary()])
})

describe('loading', () => {
  it('loads the project list and the selected project', async () => {
    vi.spyOn(api, 'project').mockResolvedValue(project())
    useStore.setState({ projectId: 'box' })
    render(<Server />)
    await waitFor(() => expect(s().project?.id).toBe('box'))
    expect(s().projects).toEqual([summary()])
    expect(events.announced).toEqual(['box'])
  })

  it('shows the error when the project cannot be loaded', async () => {
    vi.spyOn(api, 'project').mockRejectedValue(new Error('project "gone" does not exist'))
    useStore.setState({ projectId: 'gone' })
    render(<Server />)
    await waitFor(() => expect(s().error).toBe('project "gone" does not exist'))
  })

  it('loads the newly selected project and announces it', async () => {
    const load = vi.spyOn(api, 'project').mockImplementation(async (id) => project({ id }))
    render(<Server />)
    expect(load).not.toHaveBeenCalled()
    act(() => s().selectProject('other'))
    await waitFor(() => expect(s().project?.id).toBe('other'))
    expect(events.announced).toEqual([null, 'other'])
  })
})

describe('live events', () => {
  beforeEach(async () => {
    vi.spyOn(api, 'project').mockResolvedValue(project())
    useStore.setState({ projectId: 'box' })
    render(<Server />)
    await waitFor(() => expect(s().project).not.toBeNull())
  })

  it('tracks renders of the open project and reloads it afterwards', async () => {
    act(() => on().onRenderStart({ project: 'box', kind: 'tweak' }))
    expect(s().rendering.tweak).toBe(true)
    act(() => on().onRenderStart({ project: 'other', kind: 'preview' }))
    expect(s().rendering.preview).toBe(false)
    vi.mocked(api.project).mockResolvedValue(project({ name: 'Box 2' }))
    act(() => on().onRender({ project: 'box', kind: 'tweak', result: renderResult() }))
    expect(s().rendering.tweak).toBe(false)
    await waitFor(() => expect(s().project?.name).toBe('Box 2'))
  })

  it('reloads only the open project when files change', async () => {
    const load = vi.mocked(api.project)
    load.mockClear()
    act(() => on().onChanged({ project: 'other' }))
    expect(load).not.toHaveBeenCalled()
    act(() => on().onChanged({ project: 'box' }))
    expect(load).toHaveBeenCalledWith('box')
  })

  it('follows navigation requests from the CLI', () => {
    act(() => on().onNavigate({ project: 'other' }))
    expect(s().projectId).toBe('other')
  })

  it('shows the result of exports of the open project', () => {
    act(() => on().onExportStart({ project: 'box', tweaked: false, set: null }))
    expect(s().exporting).toBe(true)
    act(() => on().onExport({ project: 'box', result: null, error: 'OpenSCAD failed' }))
    expect(s().exporting).toBe(false)
    expect(s().exportNotice).toMatchObject({ result: null, error: 'OpenSCAD failed' })
  })
})
