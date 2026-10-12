import { Html, Line } from '@react-three/drei'
import type { Annotation, Vec3 } from '@scad/core/protocol'
import { CornerDownLeft, Trash } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { type NoteDraft, useStore } from '../store.ts'
import { fmt } from './Helpers.tsx'

const EDITOR_Z: [number, number] = [16777400, 16777300]

export const extentOf = (bounds: [Vec3, Vec3] | null) =>
  bounds ? Math.max(...bounds[1].map((v, i) => v - bounds[0][i]), 10) : 100

export const stemLength = (extent: number) => Math.max(extent * 0.07, 2)

export const tipOf = (point: Vec3, normal: Vec3, extent: number): Vec3 => {
  const s = stemLength(extent)
  return [point[0] + normal[0] * s, point[1] + normal[1] * s, point[2] + normal[2] * s]
}

export const noteNumber = (n: number) => String(n).padStart(2, '0')

type Describable = Pick<Annotation, 'kind' | 'edge' | 'surface'>

export const summarize = ({ kind, edge, surface }: Describable) => {
  const c = surface?.cylinder
  if (kind === 'edge' && edge)
    return `edge ${fmt(edge.length)} mm, ${fmt(edge.angle)}° ${edge.convex ? 'convex' : 'concave'}`
  const where = kind === 'vertex' ? 'corner of ' : ''
  if (c) return `${where}${c.concave ? 'hole' : 'boss'} Ø${fmt(c.radius * 2)} × ${fmt(c.length)}`
  if (surface?.type === 'planar') return `${where}flat face ${fmt(surface.area)} mm²`
  if (surface) return `${where}curved surface`
  return kind
}

type BalloonProps = {
  point: Vec3
  normal: Vec3
  extent: number
  label: string
  variant: 'draft' | 'active' | 'sent'
  title: string
  onSelect?: () => void
}

const Balloon = ({ point, normal, extent, label, variant, title, onSelect }: BalloonProps) => {
  const tip = tipOf(point, normal, extent)
  const color = variant === 'sent' ? '#5ad1e6' : '#f2a541'
  return (
    <group>
      <Line
        points={[point, tip]}
        color={color}
        lineWidth={variant === 'active' ? 2 : 1.4}
        dashed={variant === 'sent'}
        dashSize={1.2}
        gapSize={0.8}
        depthTest={false}
        transparent
        opacity={variant === 'sent' ? 0.7 : 1}
        renderOrder={11}
      />
      <Html position={point} center className={`note-anchor is-${variant}`} />
      <Html position={tip} center zIndexRange={variant === 'active' ? EDITOR_Z : undefined}>
        {onSelect ? (
          <button
            type="button"
            className={`note-balloon is-${variant}`}
            title={title || 'Empty note'}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            {label}
          </button>
        ) : (
          <span className={`note-balloon is-${variant}`} title={title}>
            {label}
          </span>
        )}
      </Html>
    </group>
  )
}

const Editor = ({ note, index, extent }: { note: NoteDraft; index: number; extent: number }) => {
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
      {index >= 0 && <Editor note={notes[index]} index={index} extent={extent} />}
    </group>
  )
}
