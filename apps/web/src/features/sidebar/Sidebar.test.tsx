import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import { param, project, renderResult } from '../../test/fixtures.ts'
import { Sidebar } from './Sidebar.tsx'

const withParams = project({ render: renderResult({ params: [param()] }) })

it('collapses into a rail with counts and opens again', () => {
  render(<Sidebar project={withParams} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide panel (B)' }))
  expect(useStore.getState().sidebar).toBe(false)
  const rail = screen.getByTitle('Show panel (B)')
  expect(rail).toHaveTextContent('Parts 1')
  expect(rail).toHaveTextContent('Notes 0')
  expect(rail).toHaveTextContent('Parameters 1')
  act(() => useStore.getState().setEdit('width', 30))
  expect(rail.querySelector('.rail-badge')).toHaveTextContent('1')
  fireEvent.click(rail)
  expect(useStore.getState().sidebar).toBe(true)
})

it('makes the hidden half inert', () => {
  const { container } = render(<Sidebar project={withParams} />)
  expect(container.querySelector('.sidebar-rail-wrap')).toHaveAttribute('inert')
  expect(container.querySelector('.sidebar-body')).not.toHaveAttribute('inert')
})
