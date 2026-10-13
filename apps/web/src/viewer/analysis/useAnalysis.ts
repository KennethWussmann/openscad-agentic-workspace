import type { PrintProfile } from '@scad/protocol'
import { useEffect, useMemo, useState } from 'react'
import type { AnalysisMode } from '../../store/store.ts'
import type { LoadedModel } from '../model/loader.ts'
import type { AnalysisResult } from './heat.ts'
import { islands } from './islands.ts'
import { overhangs } from './overhangs.ts'
import { measure, walls } from './walls.ts'

export const useAnalysis = (
  models: Record<string, LoadedModel>,
  visible: string[],
  settings: PrintProfile,
  mode: AnalysisMode | null,
): AnalysisResult | null => {
  const shown = useMemo(
    () => visible.map((id) => models[id]).filter((m): m is LoadedModel => Boolean(m)),
    [models, visible],
  )
  const [fields, setFields] = useState<Record<string, Float32Array>>({})
  useEffect(() => {
    if (mode !== 'walls') return
    let alive = true
    for (const model of shown)
      measure(model).then((field) => {
        if (alive) setFields((f) => (f[model.key] === field ? f : { ...f, [model.key]: field }))
      })
    return () => {
      alive = false
    }
  }, [mode, shown])
  const result = useMemo(() => {
    if (mode === 'overhangs') return settings.process === 'fdm' ? overhangs(shown, settings) : islands(shown)
    if (mode === 'walls') return walls(shown, fields, settings)
    return null
  }, [mode, shown, fields, settings])
  useEffect(() => {
    if (!result) return
    return () => {
      for (const g of Object.values(result.heat)) g.dispose()
    }
  }, [result])
  return result
}
