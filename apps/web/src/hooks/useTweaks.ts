import { useEffect, useRef } from 'react'
import { api } from '../api/client.ts'
import { useStore } from '../store/store.ts'

export const useTweaks = (refreshProject: () => void) => {
  const edits = useStore((s) => s.edits)
  const projectId = useStore((s) => s.projectId)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!projectId) return
    const timer = setTimeout(() => {
      const task = Object.keys(edits).length ? api.tweak(projectId, edits) : api.clearTweak(projectId)
      task.then(refreshProject).catch(() => undefined)
    }, 350)
    return () => clearTimeout(timer)
  }, [edits, projectId, refreshProject])
}
