import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { api } from '../../api/client.ts'
import { useStore } from '../../store/store.ts'
import { param, partResult, project, renderResult } from '../../test/fixtures.ts'
import { ParamsPanel } from './ParamsPanel.tsx'

const params = [
  param({ name: 'width', initial: 20, group: 'Size', caption: 'Outer width' }),
  param({ name: 'depth', initial: 10, group: 'Size' }),
  param({ name: 'lid', type: 'boolean', initial: true }),
]

const withParams = (overrides = {}) => project({ render: renderResult({ params }), ...overrides })
const s = () => useStore.getState()

it('groups parameters and shows their captions', () => {
  render(<ParamsPanel project={withParams()} />)
  const size = screen.getByRole('group', { name: 'Size' })
  expect(within(size).getByRole('spinbutton', { name: 'width' })).toHaveValue(20)
  expect(within(size).getByText('Outer width')).toBeInTheDocument()
  expect(within(screen.getByRole('group', { name: 'Parameters' })).getByRole('switch', { name: 'lid' })).toBeVisible()
  expect(screen.getByText('3')).toHaveClass('count')
})

it('explains when there are no parameters', () => {
  render(<ParamsPanel project={project()} />)
  expect(screen.getByText(/No customizer parameters/)).toBeInTheDocument()
})

it('records edits, drops edits back to the initial value and resets single values', () => {
  render(<ParamsPanel project={withParams()} />)
  const width = screen.getByRole('spinbutton', { name: 'width' })
  fireEvent.change(width, { target: { value: '30' } })
  expect(s().edits).toEqual({ width: 30 })
  expect(screen.getByText('1 tweaked')).toBeInTheDocument()
  fireEvent.change(width, { target: { value: '20' } })
  expect(s().edits).toEqual({})
  fireEvent.click(screen.getByRole('switch', { name: 'lid' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reset lid' }))
  expect(s().edits).toEqual({})
})

it('sends tweaks with a note to the agent', async () => {
  const send = vi.spyOn(api, 'sendProposal').mockResolvedValue({ ok: true, file: 'proposals/params.json' })
  render(<ParamsPanel project={withParams()} />)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'depth' }), { target: { value: '15' } })
  const note = screen.getByPlaceholderText('Note for the agent (optional)')
  fireEvent.change(note, { target: { value: 'deeper' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send to agent' })))
  expect(send).toHaveBeenCalledWith('box', { depth: 15 }, 'deeper')
  expect(note).toHaveValue('')
})

it('resets all tweaks and clears the server side tweak', () => {
  const clear = vi.spyOn(api, 'clearTweak').mockResolvedValue({ ok: true })
  render(<ParamsPanel project={withParams()} />)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'depth' }), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(s().edits).toEqual({})
  expect(clear).toHaveBeenCalledWith('box')
  expect(screen.queryByRole('button', { name: 'Send to agent' })).not.toBeInTheDocument()
})

it('shows failing tweaks, a running tweak render and pending proposals', () => {
  const tweak = renderResult({
    status: 'error',
    parts: [partResult({ status: 'error', diagnostics: [{ level: 'error', message: 'Assertion failed' }] })],
  })
  const proposals = { params: { params: { width: 30 }, createdAt: '', basedOn: null }, annotations: null }
  act(() => {
    s().setEdit('width', 30)
    s().setRendering('tweak', true)
  })
  render(<ParamsPanel project={withParams({ tweak, proposals })} />)
  expect(screen.getByText('Tweak failed: Assertion failed')).toBeInTheDocument()
  expect(screen.getByText('rendering')).toBeInTheDocument()
  expect(screen.getByText(/Sent to the agent: width/)).toBeInTheDocument()
})

it('notes that tweaks apply to the working copy while viewing a version', () => {
  useStore.setState({ versionId: 'v1' })
  render(<ParamsPanel project={withParams()} />)
  expect(screen.getByText('Viewing v1. Tweaks apply to the working copy.')).toBeInTheDocument()
})
