import type { Annotation } from '@scad/protocol'
import { useStore } from '../../store/store.ts'
import { Balloon } from './Balloon.tsx'
import { NoteEditor } from './NoteEditor.tsx'

export const Notes = ({ extent, sent }: { extent: number; sent: Annotation[] }) => {
  const notes = useStore((s) => s.notes)
  const editing = useStore((s) => s.editing)
  const editNote = useStore((s) => s.editNote)
  const index = notes.findIndex((n) => n.id === editing)
  return (
    <group>
      {sent.map((a) => (
        <Balloon
          key={`sent:${a.n}`}
          point={a.point}
          normal={a.normal}
          extent={extent}
          label={String(a.n)}
          variant="sent"
          title={`Sent: ${a.text}`}
        />
      ))}
      {notes.map((n, i) => (
        <Balloon
          key={n.id}
          point={n.point}
          normal={n.normal}
          extent={extent}
          label={String(i + 1)}
          variant={n.id === editing ? 'active' : 'draft'}
          title={n.text}
          onSelect={() => editNote(n.id)}
        />
      ))}
      {index >= 0 && <NoteEditor note={notes[index]} index={index} extent={extent} />}
    </group>
  )
}
