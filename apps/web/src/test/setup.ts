import '@testing-library/jest-dom/vitest'
import '../setup.ts'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { useStore } from '../store/store.ts'

const initial = useStore.getState()

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  useStore.setState(initial, true)
})

afterEach(() => cleanup())

class StillResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= StillResizeObserver
