import type { AnnotationProposal } from '@scad/protocol'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useStore } from '../../store/store.ts'
import { project } from '../../test/fixtures.ts'
import { NotesPanel } from './NotesPanel.tsx'

const sending = vi.hoisted(() => ({
  send: vi.fn(async (_note: string) => true),
  withdraw: vi.fn(),
  busy: false,
  error: null as string | null,
}))

vi.mock('./useSendNotes.ts', () => ({ useSendNotes: () => sending }))

const draft = {
  kind: 'face' as const,
  point: [1, 2, 3] as [number, number, number],
  normal: [0, 0, 1] as [number, number, number],
  part: { id: 'main', file: 'src/main.scad', mesh: 0, color: '#fff' },
  surface: null,
  source: { kind: 'working' as const, version: null, render: null },
}

const pending: AnnotationProposal = {
  source: draft.source,
  camera: { position: [1, 1, 1], target: [0, 0, 0], up: [0, 0, 1], projection: 'perspective' },
  section: null,
  annotations: [{ ...draft, n: 1, text: 'round this' }],
  snapshot: 'proposals/annotations.png',
  createdAt: '2026-01-01T10:00:00.000Z',
  basedOn: null,
}

const s = () => useStore.getState()

const addNote = (text: string) =>
  act(() => {
    s().addNote(draft)
    s().updateNote(s().editing as number, text)
  })

beforeEach(() => {
  sending.busy = false
  sending.error = null
  sending.send.mockClear()
})

it('starts note mode from the call to action', () => {
  render(<NotesPanel project={project()} />)
  fireEvent.click(screen.getByRole('button', { name: /Pin notes to the model/ }))
  expect(s().tool).toBe('annotate')
  fireEvent.click(screen.getByRole('button', { name: /Click a face, edge or corner/ }))
  expect(s().tool).toBe('orbit')
})

it('lists notes with where they are pinned and edits or deletes them', () => {
  render(<NotesPanel project={project()} />)
  addNote('round this')
  act(() => s().closeEditor())
  expect(screen.getByText('round this')).toBeInTheDocument()
  expect(screen.getByText('face / main @ 1.00, 2.00, 3.00')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /round this/ }))
  expect(s().editing).toBe(s().notes[0].id)
  fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
  expect(s().notes).toEqual([])
})

it('requires text on every note before sending', () => {
  render(<NotesPanel project={project()} />)
  addNote('')
  const send = screen.getByRole('button', { name: 'Send to agent' })
  expect(send).toBeDisabled()
  expect(send).toHaveAttribute('title', 'Every note needs text')
  expect(screen.getByText('empty note')).toBeInTheDocument()
})

it('sends notes with the overall note and clears the composer', async () => {
  render(<NotesPanel project={project()} />)
  addNote('thicker')
  const overall = screen.getByPlaceholderText('Overall note for the agent (optional)')
  fireEvent.change(overall, { target: { value: 'all walls' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send to agent' })))
  expect(sending.send).toHaveBeenCalledWith('all walls')
  expect(overall).toHaveValue('')
})

it('clears all notes', () => {
  render(<NotesPanel project={project()} />)
  addNote('a')
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(s().notes).toEqual([])
})

it('shows sent notes with their snapshot, warns before replacing them and withdraws', () => {
  render(<NotesPanel project={project({ proposals: { params: null, annotations: pending } })} />)
  expect(screen.getByText('1 sent')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Snapshot sent to the agent' })).toHaveAttribute(
    'src',
    expect.stringContaining('/projects/box/file/proposals/annotations.png'),
  )
  addNote('more')
  expect(screen.getByText('Replaces the 1 note still waiting for the agent.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
  expect(sending.withdraw).toHaveBeenCalled()
})

it('shows send errors and progress', () => {
  sending.busy = true
  sending.error = 'snapshot failed'
  render(<NotesPanel project={project()} />)
  addNote('x')
  expect(screen.getByRole('button', { name: 'Sending' })).toBeDisabled()
  expect(screen.getByText('snapshot failed')).toBeInTheDocument()
})
