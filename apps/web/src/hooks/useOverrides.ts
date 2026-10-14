import { useShallow } from 'zustand/react/shallow'
import { selectOverrides, useStore } from '../store/store.ts'

export const useOverrides = () => useStore(useShallow(selectOverrides))
