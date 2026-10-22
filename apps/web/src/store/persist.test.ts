import { afterEach, expect, it, vi } from 'vitest'
import { COMPACT_MEDIA, DISPLAY_KEY, loadDisplay, loadSidebar, SIDEBAR_KEY, setParam } from './persist.ts'

afterEach(() => vi.unstubAllGlobals())

it('loads the default display', () => {
  expect(loadDisplay()).toMatchObject({ edges: true, grid: true, dims: true, xray: false, ortho: false })
})

it('merges the stored display over the defaults', () => {
  localStorage.setItem(DISPLAY_KEY, JSON.stringify({ xray: true, grid: false }))
  expect(loadDisplay()).toMatchObject({ xray: true, grid: false, edges: true })
})

it('falls back to the defaults for broken storage', () => {
  localStorage.setItem(DISPLAY_KEY, '{nope')
  expect(loadDisplay().edges).toBe(true)
})

it('sets and removes url parameters without reloading', () => {
  setParam('project', 'box')
  expect(location.search).toBe('?project=box')
  setParam('embed', '1')
  expect(new URLSearchParams(location.search).get('embed')).toBe('1')
  setParam('project', null)
  expect(location.search).toBe('?embed=1')
})

it('restores the stored sidebar state', () => {
  expect(loadSidebar()).toBe(true)
  localStorage.setItem(SIDEBAR_KEY, 'closed')
  expect(loadSidebar()).toBe(false)
})

it('starts with a closed sidebar on compact screens', () => {
  const matchMedia = vi.fn((query: string) => ({ matches: query === COMPACT_MEDIA }))
  vi.stubGlobal('matchMedia', matchMedia)
  localStorage.setItem(SIDEBAR_KEY, 'open')
  expect(loadSidebar()).toBe(false)
  expect(matchMedia).toHaveBeenCalledWith(COMPACT_MEDIA)
})
