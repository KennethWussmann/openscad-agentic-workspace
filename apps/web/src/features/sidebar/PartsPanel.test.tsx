import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import { partDef, partResult, project, renderResult, version } from '../../test/fixtures.ts'
import { PartsPanel } from './PartsPanel.tsx'

const assembly = project({
  parts: [
    partDef({ id: 'base', label: 'Base', file: 'src/base.scad' }),
    partDef({ id: 'lid', file: 'src/lid.scad' }),
    partDef({ id: 'print-plate', preview: false }),
  ],
  render: renderResult({
    parts: [
      partResult({ id: 'base' }),
      partResult({ id: 'lid', status: 'error', bbox: { min: [0, 0, 0], max: [5, 5, 1], size: [5, 5, 1] } }),
    ],
  }),
  versions: [
    version({ parts: [{ id: 'base', model: null, bbox: { min: [0, 0, 0], max: [1, 2, 3], size: [1, 2, 3] } }] }),
  ],
})

const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) }).closest('li') as HTMLElement

it('lists previewable parts with their file and size', () => {
  render(<PartsPanel project={assembly} />)
  expect(row('Base')).toHaveTextContent('src/base.scad')
  expect(row('Base')).toHaveTextContent('20.00 x 10.00 x 5.00')
  expect(row('lid')).toHaveTextContent('5.00 x 5.00 x 1.00')
  expect(screen.queryByText('print-plate')).not.toBeInTheDocument()
})

it('shows the sizes of the selected version', () => {
  useStore.setState({ versionId: 'v1' })
  render(<PartsPanel project={assembly} />)
  expect(row('Base')).toHaveTextContent('1.00 x 2.00 x 3.00')
  expect(row('lid')).toHaveTextContent('-')
})

it('hides parts and solos one of them', () => {
  render(<PartsPanel project={assembly} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Toggle visibility' })[1])
  expect(useStore.getState().hidden).toEqual(['lid'])
  expect(row('lid')).toHaveClass('is-hidden')
  fireEvent.click(screen.getByRole('button', { name: /Base/ }))
  expect(useStore.getState().solo).toBe('base')
  expect(row('Base')).toHaveClass('is-solo')
  fireEvent.click(screen.getByRole('button', { name: 'show all' }))
  expect(useStore.getState().solo).toBeNull()
})
