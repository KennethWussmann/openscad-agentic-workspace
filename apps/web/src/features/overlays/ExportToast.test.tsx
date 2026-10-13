import type { CheckResult, ExportResult, PartCheck } from '@scad/protocol'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useStore } from '../../store/store.ts'
import { fdmProfile } from '../../test/fixtures.ts'
import { ExportToast } from './ExportToast.tsx'

const result = (overrides: Partial<ExportResult> = {}): ExportResult => ({
  project: 'box',
  version: 'v2',
  outDir: 'workspace/box/out',
  exportedAt: '2026-01-01T10:00:00.000Z',
  overrides: {},
  files: [
    { part: 'main', format: '3mf', file: 'out/box-main.3mf', ok: true, diagnostics: [] },
    { part: 'main', format: 'stl', file: 'out/box-main.stl', ok: true, diagnostics: [] },
  ],
  meshCheck: null,
  ...overrides,
})

const pass = { status: 'pass' as const }
const part = (overrides: Partial<PartCheck>): PartCheck =>
  ({
    id: 'main',
    status: 'pass',
    triangles: 12,
    bbox: null,
    durationMs: 1,
    manifold: pass,
    bed: pass,
    overhangs: pass,
    islands: null,
    walls: pass,
    bodies: pass,
    ...overrides,
  }) as PartCheck

const check = (parts: PartCheck[]): CheckResult => ({
  project: 'box',
  status: parts.some((p) => p.status === 'fail') ? 'fail' : parts.some((p) => p.status === 'warn') ? 'warn' : 'pass',
  checkedAt: '',
  render: '',
  profile: fdmProfile(),
  parts,
})

afterEach(() => vi.useRealTimers())

it('lists exported files and hides itself after a clean export', () => {
  vi.useFakeTimers()
  useStore.getState().showExportNotice({ result: result(), error: null })
  const { container } = render(<ExportToast />)
  expect(screen.getByText('Exported v2')).toBeInTheDocument()
  expect(screen.getByText('box-main.3mf')).toBeInTheDocument()
  expect(screen.getByText('box-main.stl')).toBeInTheDocument()
  expect(container.firstChild).toHaveClass('is-pass')
  act(() => vi.advanceTimersByTime(6000))
  expect(useStore.getState().exportNotice).toBeNull()
})

it('keeps failures open and explains them', () => {
  vi.useFakeTimers()
  const files = [
    {
      part: 'main',
      format: 'stl' as const,
      file: 'out/box-main.stl',
      ok: false,
      diagnostics: [{ level: 'error' as const, message: 'Current top level object is empty.' }],
    },
  ]
  useStore.getState().showExportNotice({ result: result({ files, overrides: { width: 30 } }), error: null })
  const { container } = render(<ExportToast />)
  expect(container.firstChild).toHaveClass('is-fail')
  expect(screen.getByText('Current top level object is empty.')).toBeInTheDocument()
  expect(screen.getByText('tweaks: width=30')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(10000))
  expect(useStore.getState().exportNotice).not.toBeNull()
})

it('shows mesh check findings per part', () => {
  const meshCheck = check([
    part({ id: 'lid', label: 'Lid', status: 'warn', walls: { status: 'warn' } as PartCheck['walls'] }),
    part({ id: 'base' }),
  ])
  useStore.getState().showExportNotice({ result: result({ meshCheck }), error: null })
  const { container } = render(<ExportToast />)
  expect(container.firstChild).toHaveClass('is-warn')
  expect(screen.getByText('WARN')).toHaveClass('check-tag')
  expect(screen.getByText('Lid')).toBeInTheDocument()
  expect(screen.getByText('walls WARN')).toBeInTheDocument()
  expect(screen.queryByText('base')).not.toBeInTheDocument()
})

it('shows request errors and dismisses', () => {
  useStore.getState().showExportNotice({ result: null, error: 'Export already running' })
  render(<ExportToast />)
  expect(screen.getByText('Export failed')).toBeInTheDocument()
  expect(screen.getByText('Export already running')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText('Export failed')).not.toBeInTheDocument()
})
