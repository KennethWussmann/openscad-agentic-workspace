import { useEffect } from 'react'
import { Vector3 } from 'three'
import { useStore } from '../store/store.ts'
import { fit, toggleOrtho, VIEWS, viewDirection } from '../viewer/camera/rig.ts'

const KEY_VIEWS: Record<string, Vector3> = {
  '0': VIEWS.iso,
  '1': VIEWS.front,
  '2': VIEWS.top,
  '3': VIEWS.right,
  '4': VIEWS.back,
  '5': VIEWS.bottom,
  '6': VIEWS.left,
}

export const useKeys = () => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()
      const view = KEY_VIEWS[e.key]
      if (view) return viewDirection(new Vector3().copy(view))
      const versions = s.project?.versions ?? []
      const step = (dir: number) => {
        const ids = [...versions.map((v) => v.id), null]
        const i = ids.indexOf(s.versionId)
        s.setVersion(ids[Math.max(0, Math.min(ids.length - 1, i + dir))] ?? null)
      }
      const actions: Record<string, () => void> = {
        f: () => fit(),
        o: toggleOrtho,
        x: () => s.toggleDisplay('xray'),
        e: () => s.toggleDisplay('edges'),
        w: () => s.toggleDisplay('wireframe'),
        g: () => s.toggleDisplay('grid'),
        d: () => s.toggleDisplay('dims'),
        h: () => s.toggleDisplay('overhangs'),
        t: () => s.toggleDisplay('walls'),
        s: () => s.setSection({ enabled: !s.section.enabled }),
        m: () => s.setTool(s.tool === 'measure' ? 'orbit' : 'measure'),
        n: () => {
          if (!s.embed) s.setTool(s.tool === 'annotate' ? 'orbit' : 'annotate')
        },
        c: () => s.toggleConsole(),
        b: () => s.toggleSidebar(),
        v: () => s.toggleEmbed(),
        '?': () => s.toggleHelp(),
        '[': () => step(-1),
        ']': () => step(1),
        Escape: () => {
          if (s.help) s.toggleHelp()
          else if (s.editing !== null) s.closeEditor()
          else if (s.pending) s.cancelPending()
          else if (s.tool !== 'orbit') s.setTool('orbit')
        },
      }
      const action = actions[e.key] ?? actions[e.key.toLowerCase()]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
