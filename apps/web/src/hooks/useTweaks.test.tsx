import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '../api/client.ts'
import { useStore } from '../store/store.ts'
import { renderResult } from '../test/fixtures.ts'
import { useTweaks } from './useTweaks.ts'

const Tweaks = ({ refresh }: { refresh: () => void }) => {
  useTweaks(refresh)
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  useStore.setState({ projectId: 'box' })
})

afterEach(() => vi.useRealTimers())

it('renders tweaks debounced and refreshes the project afterwards', async () => {
  const tweak = vi.spyOn(api, 'tweak').mockResolvedValue(renderResult())
  const refresh = vi.fn()
  render(<Tweaks refresh={refresh} />)
  act(() => useStore.getState().setEdit('width', 30))
  act(() => useStore.getState().setEdit('width', 35))
  await act(() => vi.advanceTimersByTimeAsync(349))
  expect(tweak).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(tweak).toHaveBeenCalledExactlyOnceWith('box', { width: 35 })
  expect(refresh).toHaveBeenCalledOnce()
})

it('clears the tweak when all edits are reset', async () => {
  vi.spyOn(api, 'tweak').mockResolvedValue(renderResult())
  const clear = vi.spyOn(api, 'clearTweak').mockResolvedValue({ ok: true })
  render(<Tweaks refresh={vi.fn()} />)
  act(() => useStore.getState().setEdit('width', 30))
  await act(() => vi.advanceTimersByTimeAsync(400))
  act(() => useStore.getState().resetEdits())
  await act(() => vi.advanceTimersByTimeAsync(400))
  expect(clear).toHaveBeenCalledExactlyOnceWith('box')
})

it('does nothing on mount or without a project', async () => {
  const tweak = vi.spyOn(api, 'tweak')
  const clear = vi.spyOn(api, 'clearTweak')
  useStore.setState({ projectId: null })
  render(<Tweaks refresh={vi.fn()} />)
  act(() => useStore.getState().setEdit('width', 30))
  await act(() => vi.advanceTimersByTimeAsync(400))
  expect(tweak).not.toHaveBeenCalled()
  expect(clear).not.toHaveBeenCalled()
})
