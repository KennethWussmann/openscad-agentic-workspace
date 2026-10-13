import { useEffect, useRef } from 'react'
import { useStore } from '../../store/store.ts'
import { fit } from './rig.ts'

export const useAutoFit = (loaded: boolean) => {
  const fitToken = useStore((s) => s.fitToken)
  const fitted = useRef(0)
  useEffect(() => {
    if (!loaded || fitted.current === fitToken) return
    fitted.current = fitToken
    const id = setTimeout(() => fit(fitToken > 1), 30)
    return () => clearTimeout(id)
  }, [fitToken, loaded])
}
