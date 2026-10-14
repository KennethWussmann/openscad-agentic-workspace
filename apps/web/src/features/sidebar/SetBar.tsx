import { errorMessage, type ProjectState, type SetsResponse } from '@scad/protocol'
import { BookmarkPlus, ChevronDown, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client.ts'
import { Button } from '../../components/Button.tsx'
import { cx } from '../../components/classes.ts'
import { Hint } from '../../components/Hint.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { plural } from '../../lib/format.ts'
import { overridesOf, setValues } from '../../lib/sets.ts'
import { useStore } from '../../store/store.ts'
import { SaveSetForm, type SetDraft } from './SaveSetForm.tsx'

const applySets = (project: ProjectState, response: SetsResponse) =>
  useStore.getState().setProject({ ...project, sets: response.sets, setIssues: response.issues })

export const SetBar = ({ project }: { project: ProjectState }) => {
  const activeSet = useStore((s) => s.activeSet)
  const edits = useStore((s) => s.edits)
  const selectSet = useStore((s) => s.selectSet)
  const [mode, setMode] = useState<'idle' | 'save' | 'delete'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const names = Object.keys(project.sets)
  const changed = Object.keys(edits).length
  if (!names.length && !changed) return null
  const set = activeSet ? project.sets[activeSet] : undefined
  const issues = project.setIssues.filter((i) => !activeSet || i.set === activeSet)
  const values = overridesOf(setValues(project, activeSet), edits)

  const run = async (task: () => Promise<SetsResponse>, after: () => void) => {
    setBusy(true)
    setError(null)
    try {
      applySets(project, await task())
      after()
      setMode('idle')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const saveNew = (draft: SetDraft) =>
    run(
      () =>
        api.saveSet(project.id, {
          name: draft.name,
          ...(draft.label ? { label: draft.label } : {}),
          values,
          export: draft.export,
        }),
      () => selectSet(draft.name),
    )

  const update = () => {
    if (!activeSet) return
    run(
      () => api.saveSet(project.id, { name: activeSet, values, replace: true }),
      () => selectSet(activeSet),
    )
  }

  const remove = () => {
    if (!activeSet) return
    run(
      () => api.deleteSet(project.id, activeSet),
      () => selectSet(null),
    )
  }

  return (
    <div className={cx('setbar', activeSet && 'is-set', changed > 0 && 'is-tweaked')}>
      {names.length > 0 && (
        <div className="setbar-row">
          <span className="setbar-tag mono">Set</span>
          <div className="setbar-select">
            <select
              aria-label="Parameter set"
              value={activeSet ?? ''}
              onChange={(e) => {
                setMode('idle')
                setError(null)
                selectSet(e.target.value || null)
              }}
            >
              <option value="">Defaults from source</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {project.sets[n].label ?? n}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden />
          </div>
          {activeSet && (
            <IconButton
              title={`Delete set ${activeSet}`}
              onClick={() => setMode(mode === 'delete' ? 'idle' : 'delete')}
            >
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>
      )}
      {set && activeSet && (
        <div className="setbar-meta mono">
          <span className="setbar-name">{activeSet}</span>
          <span>{plural(Object.keys(set.values).length, 'value')}</span>
          {set.parts && <span>parts {set.parts.join(', ')}</span>}
          {set.export && <span className="setbar-flag">release</span>}
        </div>
      )}
      {issues.length > 0 && (
        <Hint tone="warn">
          {issues.map((i) => (
            <span key={`${i.set}:${i.param}`} className="setbar-issue">
              {activeSet ? i.message : `${i.set}: ${i.message}`}
            </span>
          ))}
        </Hint>
      )}
      {mode === 'delete' && activeSet && (
        <div className="setbar-confirm">
          <span>
            Delete <strong>{set?.label ?? activeSet}</strong> from config.yaml?
          </span>
          <div className="proposal-actions">
            <Button variant="ghost" onClick={() => setMode('idle')}>
              Keep
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      )}
      {mode === 'save' && (
        <SaveSetForm
          existing={names}
          busy={busy}
          error={error}
          onSave={saveNew}
          onCancel={() => {
            setMode('idle')
            setError(null)
          }}
        />
      )}
      {mode === 'idle' && changed > 0 && (
        <div className="setbar-actions">
          {activeSet && (
            <Button
              variant="ghost"
              onClick={update}
              disabled={busy}
              title={`Write the current values into ${activeSet}`}
            >
              <Save size={14} /> Update set
            </Button>
          )}
          <Button variant="ghost" onClick={() => setMode('save')} title="Save the current values as a new set">
            <BookmarkPlus size={14} /> Save as set
          </Button>
        </div>
      )}
      {mode !== 'save' && error && <Hint tone="error">{error}</Hint>}
    </div>
  )
}
