import { Html } from '@react-three/drei'
import { CornerDownLeft, Trash } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { type NoteDraft, useStore } from '../../store/store.ts'
import { EDITOR_Z, noteNumber, summarize, tipOf } from './placement.ts'

export const NoteEditor = ({ note, index, extent }: { note: NoteDraft; index: number; extent: number }) => {
  const updateNote = useStore((s) => s.updateNote)
  const removeNote = useStore((s) => s.removeNote)
  const closeEditor = useStore((s) => s.closeEditor)
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (note.id) field.current?.focus()
  }, [note.id])
  return (
    <Html position={tipOf(note.point, note.normal, extent)} zIndexRange={EDITOR_Z} className="note-editor-anchor">
      <div className="note-editor" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <span className="note-editor-id mono">NOTE {noteNumber(index + 1)}</span>
          <span className="note-editor-what mono">
            {summarize(note)} / {note.part.id}
          </span>
        </header>
        <textarea
          ref={field}
          rows={3}
          value={note.text}
          placeholder="What should change here?"
          onChange={(e) => updateNote(note.id, e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
              e.preventDefault()
              closeEditor()
            }
          }}
        />
        <footer>
          <button type="button" className="note-editor-delete" onClick={() => removeNote(note.id)}>
            <Trash size={11} /> Delete
          </button>
          <span className="mono">shift+enter new line</span>
          <button type="button" className="note-editor-done" onClick={closeEditor} disabled={!note.text.trim()}>
            <CornerDownLeft size={11} /> Done
          </button>
        </footer>
      </div>
    </Html>
  )
}
