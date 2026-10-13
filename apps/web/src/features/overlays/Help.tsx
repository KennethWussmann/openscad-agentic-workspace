import { X } from 'lucide-react'
import { IconButton } from '../../components/IconButton.tsx'
import { useStore } from '../../store/store.ts'
import { SHORTCUTS } from './shortcuts.ts'

export const Help = () => {
  const open = useStore((s) => s.help)
  const toggle = useStore((s) => s.toggleHelp)
  if (!open) return null
  return (
    <div className="help">
      <div className="help-card">
        <header className="help-head">
          <h3>Keys</h3>
          <IconButton onClick={toggle} title="Close (Esc)">
            <X size={14} />
          </IconButton>
        </header>
        <dl>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt className="mono">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p>Drag to orbit, right-drag to pan, scroll to zoom. Click the cube to snap to faces, edges and corners.</p>
      </div>
    </div>
  )
}
