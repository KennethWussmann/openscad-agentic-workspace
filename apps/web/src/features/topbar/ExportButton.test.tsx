import type { ExportResult } from '@scad/protocol'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../api/client.ts'
import { useStore } from '../../store/store.ts'
import { project, version } from '../../test/fixtures.ts'
import { ExportButton } from './ExportButton.tsx'

const delivery = vi.hoisted(() => ({ download: vi.fn(), deliverExport: vi.fn() }))
vi.mock('../../api/download.ts', () => delivery)

const result: ExportResult = {
  project: 'box',
  version: 'v1',
  outDir: 'out',
  exportedAt: 'now',
  overrides: {},
  sets: ['default'],
  files: [],
  meshCheck: null,
}

beforeEach(() => {
  delivery.download.mockClear()
  delivery.deliverExport.mockClear()
})

it('exports the source right away without tweaks', async () => {
  const exportModels = vi.spyOn(api, 'exportModels').mockResolvedValue(result)
  render(<ExportButton project={project()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Export 3MF' }))
  expect(exportModels).toHaveBeenCalledWith('box', {}, null)
  await waitFor(() => expect(delivery.deliverExport).toHaveBeenCalledWith('box', result))
})

it('asks whether to include tweaks and closes the menu on Escape', () => {
  const exportModels = vi.spyOn(api, 'exportModels').mockResolvedValue(result)
  act(() => useStore.getState().setEdit('width', 30))
  render(<ExportButton project={project()} />)
  const button = screen.getByRole('button', { name: 'Export 3MF (source or with tweaks)' })
  fireEvent.click(button)
  expect(screen.getByRole('button', { name: /Export source/ })).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('button', { name: /Export source/ })).not.toBeInTheDocument()
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: /Export with 1 tweak/ }))
  expect(exportModels).toHaveBeenCalledWith('box', { width: 30 }, null)
})

it('downloads the stored preview of the selected version', () => {
  const exportModels = vi.spyOn(api, 'exportModels')
  useStore.setState({ versionId: 'v1' })
  render(<ExportButton project={project({ versions: [version()] })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Download the stored v1 preview 3MF' }))
  expect(exportModels).not.toHaveBeenCalled()
  expect(delivery.download).toHaveBeenCalledWith([
    { url: expect.stringContaining('/projects/box/file/versions/v1/main.3mf'), name: 'box-main-v1.3mf' },
  ])
})

it('is blocked while an export runs', () => {
  useStore.setState({ exporting: true })
  render(<ExportButton project={project()} />)
  expect(screen.getByRole('button', { name: 'Export running' })).toBeDisabled()
})

it('reports failed exports', async () => {
  vi.spyOn(api, 'exportModels').mockRejectedValue(new Error('OpenSCAD crashed'))
  render(<ExportButton project={project()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Export 3MF' }))
  await waitFor(() => expect(useStore.getState().exportNotice).toMatchObject({ error: 'OpenSCAD crashed' }))
})

const withSet = () => project({ sets: { tray: { label: 'Tray', values: { width: 60 }, export: false } } })

it('exports the selected set right away and names the files after it', async () => {
  const exportModels = vi.spyOn(api, 'exportModels').mockResolvedValue(result)
  useStore.setState({ activeSet: 'tray' })
  render(<ExportButton project={withSet()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Export 3MF (set tray)' }))
  expect(exportModels).toHaveBeenCalledWith('box', {}, 'tray')
  await waitFor(() => expect(delivery.deliverExport).toHaveBeenCalled())
})

it('offers source, set and tweaks on top of the set', () => {
  const exportModels = vi.spyOn(api, 'exportModels').mockResolvedValue(result)
  useStore.setState({ activeSet: 'tray', edits: { depth: 5 } })
  render(<ExportButton project={withSet()} />)
  const button = screen.getByRole('button', { name: 'Export 3MF (source, set or with tweaks)' })
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: /Export set tray/ }))
  expect(exportModels).toHaveBeenLastCalledWith('box', {}, 'tray')
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: /Export with 1 tweak/ }))
  expect(exportModels).toHaveBeenLastCalledWith('box', { depth: 5 }, 'tray')
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: /Export source/ }))
  expect(exportModels).toHaveBeenLastCalledWith('box', {}, null)
})
