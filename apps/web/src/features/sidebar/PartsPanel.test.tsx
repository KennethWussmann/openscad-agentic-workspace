import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import {
  assemblyDef,
  assemblyResult,
  partDef,
  partResult,
  project,
  renderResult,
  version,
} from '../../test/fixtures.ts'
import { PartsPanel } from './PartsPanel.tsx'

const multi = project({
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

it('lists previewable parts, single-selects them and shows their size', () => {
  useStore.setState({ viewMode: 'print', selectedPart: 'base', project: multi })
  render(<PartsPanel project={multi} />)
  expect(row('Base')).toHaveTextContent('src/base.scad')
  expect(row('Base')).toHaveTextContent('20.00 x 10.00 x 5.00')
  expect(row('lid')).toHaveTextContent('5.00 x 5.00 x 1.00')
  expect(screen.queryByText('print-plate')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /lid/ }))
  expect(useStore.getState().selectedPart).toBe('lid')
  fireEvent.click(screen.getByRole('button', { name: /Base/ }))
  expect(useStore.getState().selectedPart).toBe('base')
})

it('shows the sizes of the selected version', () => {
  useStore.setState({ viewMode: 'print', selectedPart: 'base', project: multi, versionId: 'v1' })
  render(<PartsPanel project={multi} />)
  expect(row('Base')).toHaveTextContent('1.00 x 2.00 x 3.00')
  expect(row('lid')).toHaveTextContent('-')
})

const withAssembly = project({
  parts: [partDef({ id: 'base', label: 'Base' }), partDef({ id: 'lid' })],
  assemblies: [assemblyDef({ id: 'fitted', label: 'Assembled', preview: true })],
  render: renderResult({
    parts: [partResult({ id: 'base' }), partResult({ id: 'lid' })],
    assemblies: [
      assemblyResult({
        parts: [
          {
            id: 'base',
            model: 'preview/assemblies/fitted/base.3mf',
            stale: false,
            bbox: { min: [0, 0, 0], max: [20, 10, 5], size: [20, 10, 5] },
            facets: 12,
            vertices: 8,
            durationMs: 40,
            diagnostics: [],
          },
          {
            id: 'lid',
            model: 'preview/assemblies/fitted/lid.3mf',
            stale: false,
            bbox: { min: [0, 0, 5], max: [20, 10, 8], size: [20, 10, 3] },
            facets: 12,
            vertices: 8,
            durationMs: 40,
            diagnostics: [],
          },
        ],
      }),
    ],
  }),
})

it('switches between print and assembly tabs', () => {
  useStore.setState({ viewMode: 'print', selectedPart: 'base', project: withAssembly })
  render(<PartsPanel project={withAssembly} />)
  expect(screen.getByRole('tab', { name: 'Print' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: 'Assembly' }))
  expect(useStore.getState().viewMode).toBe('assembly')
})

it('lists assemblies with part eyes, peek and explode slider', () => {
  useStore.setState({ viewMode: 'assembly', selectedAssembly: 'fitted', project: withAssembly })
  render(<PartsPanel project={withAssembly} />)
  expect(row('Assembled')).toHaveTextContent('2 parts')
  expect(row('Assembled')).toHaveTextContent('preview')
  expect(row('Base')).toHaveTextContent('20.00 x 10.00 x 5.00')
  fireEvent.click(screen.getAllByRole('button', { name: 'Hide in assembly' })[0])
  expect(useStore.getState().assemblyHidden).toEqual(['base'])
  fireEvent.click(screen.getByRole('button', { name: /Base/ }))
  expect(useStore.getState().peekPart).toBe('base')
  const slider = screen.getByRole('slider', { name: 'Explode assembly' })
  fireEvent.input(slider, { target: { value: '40' } })
  expect(useStore.getState().explode).toBe(0.4)
})

it('opens a part in print view from the assembly list', () => {
  useStore.setState({ viewMode: 'assembly', selectedAssembly: 'fitted', project: withAssembly })
  render(<PartsPanel project={withAssembly} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Open in print view' })[0])
  expect(useStore.getState()).toMatchObject({ viewMode: 'print', selectedPart: 'base' })
})

it('hides the tabs when the project has no assemblies', () => {
  useStore.setState({ viewMode: 'print', selectedPart: 'base', project: multi })
  render(<PartsPanel project={multi} />)
  expect(screen.queryByRole('tab', { name: 'Assembly' })).not.toBeInTheDocument()
})
