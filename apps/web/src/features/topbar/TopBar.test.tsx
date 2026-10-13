import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client.ts'
import { useStore } from '../../store/store.ts'
import { partResult, project, renderResult, summary } from '../../test/fixtures.ts'
import { Status } from './Status.tsx'
import { TopBar } from './TopBar.tsx'

const projects = [summary(), summary({ id: 'lid', name: 'Lid', proposal: true })]
const s = () => useStore.getState()

describe('TopBar', () => {
  it('switches projects and marks pending proposals', () => {
    render(<TopBar projects={projects} project={null} />)
    const picker = screen.getByRole('combobox', { name: 'Project' })
    expect(screen.getByRole('option', { name: 'Lid (lid) *' })).toBeInTheDocument()
    fireEvent.change(picker, { target: { value: 'lid' } })
    expect(s().projectId).toBe('lid')
    fireEvent.change(picker, { target: { value: '' } })
    expect(s().projectId).toBeNull()
  })

  it('hides project actions without a project', () => {
    render(<TopBar projects={projects} project={null} />)
    expect(screen.queryByRole('button', { name: 'Render now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keys (?)' })).toBeInTheDocument()
  })

  it('renders, toggles the console, help and viewport mode', () => {
    const renderNow = vi.spyOn(api, 'render').mockResolvedValue(renderResult())
    render(<TopBar projects={projects} project={project()} />)
    expect(screen.getByText('A plain box')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Render now' }))
    expect(renderNow).toHaveBeenCalledWith('box')
    fireEvent.click(screen.getByRole('button', { name: 'Console (C)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keys (?)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Viewport only (V)' }))
    expect(s()).toMatchObject({ console: true, help: true, embed: true })
  })
})

describe('Status', () => {
  it('reports render results and warnings', () => {
    const render1 = renderResult({
      durationMs: 321,
      parts: [partResult({ diagnostics: [{ level: 'warning', message: 'w' }] })],
    })
    const { container } = render(<Status project={project({ render: render1 })} />)
    expect(screen.getByText('rendered 321 ms')).toBeInTheDocument()
    expect(screen.getByText('1 warn')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-ok')
  })

  it('reports failures, missing renders and busy states', () => {
    const { rerender, container } = render(<Status project={project({ render: renderResult({ status: 'error' }) })} />)
    expect(screen.getByText(/failed/)).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-error')
    rerender(<Status project={project({ render: null })} />)
    expect(screen.getByText('not rendered')).toBeInTheDocument()
    act(() => s().setRendering('tweak', true))
    expect(screen.getByText('rendering tweak')).toBeInTheDocument()
    act(() => s().setRendering('preview', true))
    act(() => s().setExporting(true))
    expect(screen.getByText('exporting')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-busy')
  })
})
