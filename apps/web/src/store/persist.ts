import type { Display } from './types.ts'

export const DISPLAY_KEY = 'scad-display'
export const SIDEBAR_KEY = 'scad-sidebar'
export const COMPACT_MEDIA = '(max-width: 699px), (max-height: 500px)'

export const setParam = (name: string, value: string | null) => {
  const url = new URL(location.href)
  if (value === null) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  history.replaceState(null, '', url)
}

export const urlParams = new URLSearchParams(location.search)

export const loadDisplay = (): Display => {
  const base: Display = {
    xray: false,
    edges: true,
    wireframe: false,
    grid: true,
    dims: true,
    ortho: false,
    modelColors: true,
    overhangs: false,
    walls: false,
  }
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? '{}') as Partial<Display>) }
  } catch {
    return base
  }
}

export const loadSidebar = () => {
  const compact = typeof matchMedia === 'function' && matchMedia(COMPACT_MEDIA).matches
  return !compact && localStorage.getItem(SIDEBAR_KEY) !== 'closed'
}
