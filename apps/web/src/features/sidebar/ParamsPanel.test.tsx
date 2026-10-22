import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { api } from '../../api/client.ts'
import { useStore } from '../../store/store.ts'
import { param, partResult, project, renderResult } from '../../test/fixtures.ts'
import { enterValue } from '../../test/input.ts'
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
  expect(within(size).getByRole('spinbutton', { name: 'width' })).toHaveValue('20')
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
  enterValue(width, '30')
  expect(s().edits).toEqual({ width: 30 })
  expect(screen.getByText('1 tweaked')).toBeInTheDocument()
  enterValue(width, '20')
  expect(s().edits).toEqual({})
  fireEvent.click(screen.getByRole('switch', { name: 'lid' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reset lid' }))
  expect(s().edits).toEqual({})
})

it('sends tweaks with a note to the agent', async () => {
  const send = vi.spyOn(api, 'sendProposal').mockResolvedValue({ ok: true, file: 'proposals/params.json' })
  render(<ParamsPanel project={withParams()} />)
  enterValue(screen.getByRole('spinbutton', { name: 'depth' }), '15')
  const note = screen.getByPlaceholderText('Note for the agent (optional)')
  fireEvent.change(note, { target: { value: 'deeper' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send to agent' })))
  expect(send).toHaveBeenCalledWith('box', { depth: 15 }, 'deeper', null)
  expect(note).toHaveValue('')
})

it('resets all tweaks and clears the server side tweak', () => {
  const clear = vi.spyOn(api, 'clearTweak').mockResolvedValue({ ok: true })
  render(<ParamsPanel project={withParams()} />)
  enterValue(screen.getByRole('spinbutton', { name: 'depth' }), '15')
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

const sets = {
  tray: { label: 'Tray', values: { width: 40, lid: false }, export: true },
  deep: { values: { depth: 30 }, export: false },
}

it('hides the set bar for projects without sets until something is tweaked', () => {
  render(<ParamsPanel project={withParams()} />)
  expect(screen.queryByRole('combobox', { name: 'Parameter set' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Save as set/ })).not.toBeInTheDocument()
  enterValue(screen.getByRole('spinbutton', { name: 'width' }), '30')
  expect(screen.getByRole('button', { name: /Save as set/ })).toBeInTheDocument()
})

it('loads a set as the baseline and marks values that differ from it', () => {
  render(<ParamsPanel project={withParams({ sets })} />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Parameter set' }), { target: { value: 'tray' } })
  expect(s().activeSet).toBe('tray')
  const width = screen.getByRole('spinbutton', { name: 'width' })
  expect(width).toHaveValue('40')
  expect(width.closest('.param')).toHaveClass('is-set')
  expect(screen.getByText('default 20')).toBeInTheDocument()
  expect(screen.getByText('2 values')).toBeInTheDocument()
  expect(screen.getByText('release')).toBeInTheDocument()
  enterValue(width, '45')
  expect(s().edits).toEqual({ width: 45 })
  expect(width.closest('.param')).toHaveClass('is-edited')
  enterValue(width, '40')
  expect(s().edits).toEqual({})
  fireEvent.change(screen.getByRole('combobox', { name: 'Parameter set' }), { target: { value: '' } })
  expect(s().activeSet).toBeNull()
  expect(screen.getByRole('spinbutton', { name: 'width' })).toHaveValue('20')
})

it('updates the selected set with the tweaked values', async () => {
  const save = vi.spyOn(api, 'saveSet').mockResolvedValue({ ok: true, sets, issues: [] })
  act(() => useStore.setState({ project: withParams({ sets }), activeSet: 'tray', edits: { depth: 12 } }))
  render(<ParamsPanel project={withParams({ sets })} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Update set/ })))
  expect(save).toHaveBeenCalledWith('box', {
    name: 'tray',
    values: { width: 40, lid: false, depth: 12 },
    replace: true,
  })
  expect(s().edits).toEqual({})
  expect(s().activeSet).toBe('tray')
})

it('saves the tweak as a new set with a name derived from the label', async () => {
  const next = { ...sets, 'screw-tray': { label: 'Screw tray', values: { width: 33 }, export: true } }
  const save = vi.spyOn(api, 'saveSet').mockResolvedValue({ ok: true, sets: next, issues: [] })
  act(() => useStore.setState({ project: withParams({ sets }), edits: { width: 33 } }))
  render(<ParamsPanel project={withParams({ sets })} />)
  fireEvent.click(screen.getByRole('button', { name: /Save as set/ }))
  const form = screen.getByRole('form', { name: 'Save as set' })
  fireEvent.change(within(form).getByPlaceholderText('Screw tray'), { target: { value: 'Tray' } })
  expect(within(form).getByText('Name: a set named "tray" already exists')).toBeInTheDocument()
  expect(within(form).getByRole('button', { name: /Save set/ })).toBeDisabled()
  fireEvent.change(within(form).getByPlaceholderText('Screw tray'), { target: { value: 'Screw tray' } })
  expect(within(form).getByPlaceholderText('screw-tray')).toHaveValue('screw-tray')
  fireEvent.click(within(form).getByRole('checkbox', { name: 'Export on release' }))
  await act(async () => fireEvent.click(within(form).getByRole('button', { name: /Save set/ })))
  expect(save).toHaveBeenCalledWith('box', {
    name: 'screw-tray',
    label: 'Screw tray',
    values: { width: 33 },
    export: true,
  })
  expect(s().activeSet).toBe('screw-tray')
  expect(s().project?.sets['screw-tray']).toBeDefined()
})

it('shows server errors when saving fails', async () => {
  vi.spyOn(api, 'saveSet').mockRejectedValue(new Error('width: 900 is above the maximum 400'))
  act(() => useStore.setState({ project: withParams({ sets }), activeSet: 'tray', edits: { width: 900 } }))
  render(<ParamsPanel project={withParams({ sets })} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Update set/ })))
  expect(screen.getByText('width: 900 is above the maximum 400')).toBeInTheDocument()
  expect(s().edits).toEqual({ width: 900 })
})

it('deletes the selected set after confirmation and shows set warnings', async () => {
  const remove = vi.spyOn(api, 'deleteSet').mockResolvedValue({ ok: true, sets: { deep: sets.deep }, issues: [] })
  const setIssues = [{ set: 'tray', param: 'lid', message: 'lid: 1 is not a boolean' }]
  act(() => useStore.setState({ project: withParams({ sets, setIssues }), activeSet: 'tray' }))
  render(<ParamsPanel project={withParams({ sets, setIssues })} />)
  expect(screen.getByText('lid: 1 is not a boolean')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete set tray' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Delete$/ })))
  expect(remove).toHaveBeenCalledWith('box', 'tray')
  expect(s().activeSet).toBeNull()
})

it('sends tweaks on top of a set with the set name', async () => {
  const send = vi.spyOn(api, 'sendProposal').mockResolvedValue({ ok: true, file: 'proposals/params.json' })
  act(() => useStore.setState({ activeSet: 'tray', edits: { depth: 12 } }))
  render(<ParamsPanel project={withParams({ sets })} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send to agent' })))
  expect(send).toHaveBeenCalledWith('box', { depth: 12 }, '', 'tray')
})
