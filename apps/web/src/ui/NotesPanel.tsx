import type { ProjectState } from '@scad/core/protocol'
import { MapPinPlus, Send, Trash, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { fileUrl, sendAnnotations, withdrawAnnotations } from '../api.ts'
import { useStore } from '../store.ts'
import { cameraState, captureView, sectionState } from '../viewer/capture.tsx'
import { fmt } from '../viewer/Helpers.tsx'
import { noteNumber, summarize } from '../viewer/Notes.tsx'
import { annotationSource } from '../viewer/source.ts'

const viewLabel = (project: ProjectState, versionId: string | null, tweaked: boolean) =>
  `${project.name} / ${versionId ?? (tweaked ? 'tweak' : project.versions.length ? 'wip' : 'draft')} / ${new Date().toLocaleString()}`

export const NotesPanel = ({ project }: { project: ProjectState }) => {
  const notes = useStore((s) => s.notes)
  const editing = useStore((s) => s.editing)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const editNote = useStore((s) => s.editNote)
  const removeNote = useStore((s) => s.removeNote)
  const clearNotes = useStore((s) => s.clearNotes)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = project.proposals.annotations
  const incomplete = notes.some((n) => !n.text.trim())

  const send = async () => {
    const s = useStore.getState()
    setBusy(true)
    setError(null)
    try {
      s.closeEditor()
      const ready = useStore.getState().notes
      if (!ready.length) return
      const snapshot = captureView(ready, viewLabel(project, s.versionId, Object.keys(s.edits).length > 0))
      await sendAnnotations(project.id, {
        ...(note.trim() ? { note: note.trim() } : {}),
        source: annotationSource(project, s.versionId, s.edits),
        camera: cameraState(s.display.ortho),
        section: sectionState(s.section),
        annotations: ready.map(({ id: _id, ...rest }, i) => ({ ...rest, n: i + 1, text: rest.text.trim() })),
        snapshot,
      })
      clearNotes()
      setNote('')
      if (useStore.getState().tool === 'annotate') setTool('orbit')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel notes-panel">
      <header className="panel-head">
        <h2>Notes</h2>
        <span className="count">{notes.length}</span>
        {pending && <span className="badge cyan">{pending.annotations.length} sent</span>}
      </header>
      {notes.length === 0 && !pending && (
        <button
          type="button"
          className={`notes-cta${tool === 'annotate' ? ' is-active' : ''}`}
          onClick={() => setTool(tool === 'annotate' ? 'orbit' : 'annotate')}
        >
          <MapPinPlus size={15} />
          <span>
            {tool === 'annotate' ? 'Click a face, edge or corner on the model' : 'Pin notes to the model for the agent'}
          </span>
          <kbd className="mono">N</kbd>
        </button>
      )}
      {notes.length > 0 && (
        <ol className="notes">
          {notes.map((n, i) => (
            <li key={n.id} className={`note${editing === n.id ? ' is-editing' : ''}`}>
              <button type="button" className="note-main" onClick={() => editNote(n.id)}>
                <span className="note-num mono">{noteNumber(i + 1)}</span>
                <span className="note-body">
                  <span className={`note-text${n.text.trim() ? '' : ' is-empty'}`}>
                    {n.text.trim() || 'empty note'}
                  </span>
                  <small className="mono">
                    {summarize(n)} / {n.part.id} @ {n.point.map((v) => fmt(v)).join(', ')}
                  </small>
                </span>
              </button>
              <button type="button" className="icon-btn" title="Delete note" onClick={() => removeNote(n.id)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}
      {notes.length > 0 && (
        <div className="proposal">
          <textarea
            placeholder="Overall note for the agent (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          {pending && (
            <p className="hint warn">
              Replaces the {pending.annotations.length} note{pending.annotations.length === 1 ? '' : 's'} still waiting
              for the agent.
            </p>
          )}
          {error && <p className="hint error">{error}</p>}
          <div className="proposal-actions">
            <button type="button" className="btn ghost" onClick={clearNotes}>
              <Trash size={14} /> Clear
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || incomplete}
              title={incomplete ? 'Every note needs text' : 'Send the notes and a snapshot of this view'}
              onClick={send}
            >
              <Send size={14} /> {busy ? 'Sending' : 'Send to agent'}
            </button>
          </div>
        </div>
      )}
      {pending && (
        <div className="notes-sent">
          <a
            href={fileUrl(project.id, pending.snapshot, pending.createdAt)}
            target="_blank"
            rel="noreferrer"
            title="Open the snapshot the agent sees"
          >
            <img src={fileUrl(project.id, pending.snapshot, pending.createdAt)} alt="Snapshot sent to the agent" />
          </a>
          <div>
            <p className="hint ok">
              {pending.annotations.length} note{pending.annotations.length === 1 ? '' : 's'} sent. Ask the agent to
              apply them.
            </p>
            <button
              type="button"
              className="link"
              onClick={() => withdrawAnnotations(project.id).catch((e: unknown) => setError(String(e)))}
            >
              <Undo2 size={11} /> Withdraw
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
