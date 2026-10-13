import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import { project, renderResult, version } from '../../test/fixtures.ts'
import { Timeline } from './Timeline.tsx'

const versions = [version(), version({ id: 'v2', index: 2, message: 'Wider', restoredFrom: 'v1' })]
const tick = (id: string) => screen.getByText(id).closest('li') as HTMLElement

it('lists versions and the working copy', () => {
  render(<Timeline project={project({ versions })} />)
  expect(screen.getByText('First shape')).toBeInTheDocument()
  expect(tick('v2')).toHaveClass('is-restore')
  expect(screen.getByText('Working copy')).toBeInTheDocument()
  expect(tick('WIP')).toHaveClass('is-current')
})

it('marks an unchanged working copy', () => {
  const inputs = [{ path: 'box/src/main.scad', sha: 'same' }]
  render(<Timeline project={project({ versions: [version({ inputs })], render: renderResult({ inputs }) })} />)
  expect(screen.getByText('= v1')).toBeInTheDocument()
  expect(screen.getByText('Working copy, unchanged')).toBeInTheDocument()
})

it('says when nothing is rendered yet', () => {
  render(<Timeline project={project({ render: null })} />)
  expect(screen.getByText('not rendered')).toBeInTheDocument()
})

it('selects versions and overlays others as ghost', () => {
  render(<Timeline project={project({ versions })} />)
  fireEvent.click(screen.getByRole('button', { name: /^v2Wider/ }))
  expect(useStore.getState().versionId).toBe('v2')
  expect(tick('v2')).toHaveClass('is-current')
  expect(screen.getByRole('button', { name: 'Overlay v2 as ghost' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Overlay v1 as ghost' }))
  expect(useStore.getState().ghostId).toBe('v1')
  expect(tick('v1')).toHaveClass('is-ghost')
  fireEvent.click(screen.getByRole('button', { name: 'Hide overlay' }))
  expect(useStore.getState().ghostId).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Working copy/ }))
  expect(useStore.getState().versionId).toBeNull()
})
