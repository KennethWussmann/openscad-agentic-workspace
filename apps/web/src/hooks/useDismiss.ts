import { type RefObject, useEffect } from 'react'

export const useDismiss = (open: boolean, root: RefObject<HTMLElement | null>, close: () => void) => {
  useEffect(() => {
    if (!open) return
    const onEvent = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onEvent)
    document.addEventListener('keydown', onEvent)
    return () => {
      document.removeEventListener('mousedown', onEvent)
      document.removeEventListener('keydown', onEvent)
    }
  }, [open, root, close])
}
