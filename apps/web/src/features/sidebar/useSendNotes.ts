import { errorMessage, type ProjectState } from '@scad/protocol'
import { useState } from 'react'
import { api } from '../../api/client.ts'
import { selectOverrides, useStore } from '../../store/store.ts'
import { captureView } from '../../viewer/capture/snapshot.ts'
import { cameraState, sectionState } from '../../viewer/capture/viewState.ts'
import { annotationSource } from '../../viewer/model/source.ts'

const viewLabel = (project: ProjectState, versionId: string | null, tweaked: boolean) =>
  `${project.name} / ${versionId ?? (tweaked ? 'tweak' : project.versions.length ? 'wip' : 'draft')} / ${new Date().toLocaleString()}`

export const useSendNotes = (project: ProjectState) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (note: string) => {
    const s = useStore.getState()
    setBusy(true)
    setError(null)
    try {
      s.closeEditor()
      const ready = useStore.getState().notes
      if (!ready.length) return false
      const overrides = selectOverrides(s)
      const snapshot = captureView(ready, viewLabel(project, s.versionId, Object.keys(overrides).length > 0))
      await api.sendAnnotations(project.id, {
        ...(note.trim() ? { note: note.trim() } : {}),
        source: annotationSource(project, s.versionId, overrides),
        camera: cameraState(s.display.ortho),
        section: sectionState(s.section),
        annotations: ready.map(({ id: _id, ...rest }, i) => ({ ...rest, n: i + 1, text: rest.text.trim() })),
        snapshot,
      })
      s.clearNotes()
      if (useStore.getState().tool === 'annotate') s.setTool('orbit')
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const withdraw = () => api.withdrawAnnotations(project.id).catch((e: unknown) => setError(errorMessage(e)))

  return { send, withdraw, busy, error }
}
