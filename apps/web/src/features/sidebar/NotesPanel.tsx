import type { AnnotationProposal, ProjectState } from '@scad/protocol'
import { MapPinPlus, Send, Trash, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client.ts'
import { Badge } from '../../components/Badge.tsx'
import { Button } from '../../components/Button.tsx'
import { Composer } from '../../components/Composer.tsx'
import { cx } from '../../components/classes.ts'
import { Hint } from '../../components/Hint.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { Panel } from '../../components/Panel.tsx'
import { fmt, plural } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'
import { noteNumber, summarize } from '../../viewer/notes/placement.ts'
import { useSendNotes } from './useSendNotes.ts'

const NoteList = () => {
  const notes = useStore((s) => s.notes)
  const editing = useStore((s) => s.editing)
  const editNote = useStore((s) => s.editNote)
  const removeNote = useStore((s) => s.removeNote)
  return (
    <ol className="notes">
      {notes.map((n, i) => (
        <li key={n.id} className={cx('note', editing === n.id && 'is-editing')}>
          <button type="button" className="note-main" onClick={() => editNote(n.id)}>
            <span className="note-num mono">{noteNumber(i + 1)}</span>
            <span className="note-body">
              <span className={cx('note-text', !n.text.trim() && 'is-empty')}>{n.text.trim() || 'empty note'}</span>
              <small className="mono">
                {summarize(n)} / {n.part.id} @ {n.point.map((v) => fmt(v)).join(', ')}
              </small>
            </span>
          </button>
          <IconButton title="Delete note" onClick={() => removeNote(n.id)}>
            <X size={12} />
          </IconButton>
        </li>
      ))}
    </ol>
  )
}

const SentNotes = ({
  project,
  pending,
  onWithdraw,
}: {
  project: ProjectState
  pending: AnnotationProposal
  onWithdraw: () => void
}) => {
  const snapshot = api.fileUrl(project.id, pending.snapshot, pending.createdAt)
  return (
    <div className="notes-sent">
      <a href={snapshot} target="_blank" rel="noreferrer" title="Open the snapshot the agent sees">
        <img src={snapshot} alt="Snapshot sent to the agent" />
      </a>
      <div>
        <Hint tone="ok">{plural(pending.annotations.length, 'note')} sent. Ask the agent to apply them.</Hint>
        <button type="button" className="link" onClick={onWithdraw}>
          <Undo2 size={11} /> Withdraw
        </button>
      </div>
    </div>
  )
}

export const NotesPanel = ({ project }: { project: ProjectState }) => {
  const notes = useStore((s) => s.notes)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const clearNotes = useStore((s) => s.clearNotes)
  const [note, setNote] = useState('')
  const { send, withdraw, busy, error } = useSendNotes(project)
  const pending = project.proposals.annotations
  const incomplete = notes.some((n) => !n.text.trim())
  const annotating = tool === 'annotate'

  return (
    <Panel
      title="Notes"
      count={notes.length}
      className="notes-panel"
      extra={pending && <Badge tone="cyan">{pending.annotations.length} sent</Badge>}
    >
      {notes.length === 0 && !pending && (
        <button
          type="button"
          className={cx('notes-cta', annotating && 'is-active')}
          onClick={() => setTool(annotating ? 'orbit' : 'annotate')}
        >
          <MapPinPlus size={15} />
          <span>
            {annotating ? 'Click a face, edge or corner on the model' : 'Pin notes to the model for the agent'}
          </span>
          <kbd className="mono">N</kbd>
        </button>
      )}
      {notes.length > 0 && <NoteList />}
      {notes.length > 0 && (
        <Composer
          placeholder="Overall note for the agent (optional)"
          value={note}
          onChange={setNote}
          actions={
            <>
              <Button variant="ghost" onClick={clearNotes}>
                <Trash size={14} /> Clear
              </Button>
              <Button
                variant="primary"
                disabled={busy || incomplete}
                title={incomplete ? 'Every note needs text' : 'Send the notes and a snapshot of this view'}
                onClick={() =>
                  send(note).then((sent) => {
                    if (sent) setNote('')
                  })
                }
              >
                <Send size={14} /> {busy ? 'Sending' : 'Send to agent'}
              </Button>
            </>
          }
        >
          {pending && (
            <Hint tone="warn">
              Replaces the {plural(pending.annotations.length, 'note')} still waiting for the agent.
            </Hint>
          )}
          {error && <Hint tone="error">{error}</Hint>}
        </Composer>
      )}
      {pending && <SentNotes project={project} pending={pending} onWithdraw={withdraw} />}
    </Panel>
  )
}
