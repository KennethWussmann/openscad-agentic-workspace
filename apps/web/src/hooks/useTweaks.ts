import { useEffect, useRef } from 'react'
import { api } from '../api/client.ts'
import { useStore } from '../store/store.ts'
import { useOverrides } from './useOverrides.ts'

export const useTweaks = (refreshProject: () => void) => {
  const overrides = useOverrides()
  const projectId = useStore((s) => s.projectId)
  const key = JSON.stringify(overrides)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!projectId) return
    const timer = setTimeout(() => {
      const params = JSON.parse(key) as typeof overrides
      const task = Object.keys(params).length ? api.tweak(projectId, params) : api.clearTweak(projectId)
      task.then(refreshProject).catch(() => undefined)
    }, 350)
    return () => clearTimeout(timer)
  }, [key, projectId, refreshProject])
}
