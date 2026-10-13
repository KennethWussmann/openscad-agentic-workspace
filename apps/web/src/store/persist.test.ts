import { expect, it } from 'vitest'
import { DISPLAY_KEY, loadDisplay, setParam } from './persist.ts'

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
