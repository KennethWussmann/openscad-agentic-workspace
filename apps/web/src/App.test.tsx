import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { api } from './api/client.ts'
import { useStore } from './store/store.ts'
import { project, summary } from './test/fixtures.ts'

vi.mock('./features/stage/Stage.tsx', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('./api/events.ts', () => ({ connect: () => () => undefined, announce: () => undefined }))

beforeEach(() => {
  vi.spyOn(api, 'projects').mockResolvedValue([summary(), summary({ id: 'lid', name: 'Lid', versions: 2 })])
})

it('lists projects on the empty table and opens one', async () => {
  vi.spyOn(api, 'project').mockImplementation(async (id) => project({ id, name: id === 'lid' ? 'Lid' : 'Box' }))
  render(<App />)
  expect(screen.getByRole('heading', { name: /Nothing on the table/ })).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: /lid \/ 2 versions/ }))
  expect(await screen.findByTestId('stage')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Parts' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('lid')
  expect(location.search).toBe('?project=lid')
})

it('shows why a project could not be opened', async () => {
  vi.spyOn(api, 'project').mockRejectedValue(new Error('project "gone" does not exist'))
  useStore.setState({ projectId: 'gone' })
  render(<App />)
  expect(await screen.findByText('project "gone" does not exist')).toHaveClass('hint', 'error')
})

it('shows only the stage in embed mode', async () => {
  vi.spyOn(api, 'project').mockResolvedValue(project())
  useStore.setState({ projectId: 'box', embed: true })
  render(<App />)
  await waitFor(() => expect(screen.getByTestId('stage')).toBeInTheDocument())
  expect(screen.queryByRole('combobox', { name: 'Project' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Parts' })).not.toBeInTheDocument()
})

it('opens help with the keyboard', async () => {
  vi.spyOn(api, 'project').mockResolvedValue(project())
  render(<App />)
  fireEvent.keyDown(document.body, { key: '?' })
  expect(await screen.findByRole('heading', { name: 'Keys' })).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(screen.queryByRole('heading', { name: 'Keys' })).not.toBeInTheDocument()
})
