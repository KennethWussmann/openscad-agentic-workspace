import { errorMessage } from '@scad/protocol'
import { useCallback, useEffect } from 'react'
import { api } from '../api/client.ts'
import { announce, connect } from '../api/events.ts'
import { useStore } from '../store/store.ts'

export const useServer = () => {
  const refreshList = useCallback(() => {
    api
      .projects()
      .then((p) => useStore.getState().setProjects(p))
      .catch(() => undefined)
  }, [])

  const refreshProject = useCallback(() => {
    const id = useStore.getState().projectId
    if (!id) {
      useStore.getState().setProject(null)
      return
    }
    api
      .project(id)
      .then((p) => {
        if (useStore.getState().projectId === id) useStore.getState().setProject(p)
      })
      .catch((e: unknown) => useStore.getState().setProject(null, errorMessage(e)))
  }, [])

  useEffect(
    () =>
      connect(
        {
          onRenderStart: (e) => {
            if (e.project === useStore.getState().projectId) useStore.getState().setRendering(e.kind, true)
          },
          onRender: (e) => {
            refreshList()
            if (e.project !== useStore.getState().projectId) return
            useStore.getState().setRendering(e.kind, false)
            refreshProject()
          },
          onChanged: (e) => {
            refreshList()
            if (e.project === useStore.getState().projectId) refreshProject()
          },
          onNavigate: (e) => useStore.getState().selectProject(e.project),
          onExportStart: (e) => {
            if (e.project === useStore.getState().projectId) useStore.getState().setExporting(true)
          },
          onExport: (e) => {
            if (e.project !== useStore.getState().projectId) return
            useStore.getState().setExporting(false)
            useStore.getState().showExportNotice({ result: e.result, error: e.error ?? null })
          },
        },
        () => useStore.getState().projectId,
      ),
    [refreshList, refreshProject],
  )

  const projectId = useStore((s) => s.projectId)
  useEffect(() => {
    announce(projectId)
    refreshList()
    refreshProject()
  }, [projectId, refreshList, refreshProject])

  return refreshProject
}
