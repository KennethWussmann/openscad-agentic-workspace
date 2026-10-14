import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import { partDef, partResult, project, renderResult, resinProfile, version } from '../../test/fixtures.ts'
import { AnalysisLegend } from './AnalysisLegend.tsx'
import { Console } from './Console.tsx'
import { Diagnostics } from './Diagnostics.tsx'
import { Help } from './Help.tsx'
import { SHORTCUTS } from './shortcuts.ts'
import { TitleBlock } from './TitleBlock.tsx'
import { ToolHint } from './ToolHint.tsx'

const failed = renderResult({
  status: 'error',
  error: 'OpenSCAD exited with 1',
  parts: [
    partResult({
      status: 'error',
      stale: true,
      diagnostics: [
        { level: 'error', message: 'Parser error', file: 'main.scad', line: 3 },
        { level: 'warning', message: 'Ignoring unknown variable' },
      ],
    }),
  ],
})

describe('Console', () => {
  it('stays hidden until opened', () => {
    render(<Console project={project()} />)
    expect(screen.queryByText('Console')).not.toBeInTheDocument()
  })

  it('lists diagnostics of every part and closes', () => {
    useStore.setState({ console: true })
    render(<Console project={project({ render: failed })} />)
    expect(screen.getByText('2 lines')).toBeInTheDocument()
    expect(screen.getByText('Parser error').closest('li')).toHaveClass('error')
    expect(screen.getByText('main.scad:3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close console' }))
    expect(useStore.getState().console).toBe(false)
  })

  it('says when there is no output', () => {
    useStore.setState({ console: true })
    render(<Console project={project()} />)
    expect(screen.getByText('No output.')).toBeInTheDocument()
  })
})

describe('Diagnostics', () => {
  it('shows render errors and that the last good model is shown', () => {
    render(<Diagnostics project={project({ render: failed })} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Render failed')
    expect(alert).toHaveTextContent('showing the last good model')
    expect(alert).toHaveTextContent('OpenSCAD exited with 1')
    expect(alert).toHaveTextContent('Parser error')
    expect(alert).not.toHaveTextContent('Ignoring unknown variable')
  })

  it('stays hidden for good renders and while viewing a version', () => {
    const { rerender } = render(<Diagnostics project={project()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    useStore.setState({ versionId: 'v1' })
    rerender(<Diagnostics project={project({ render: failed })} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Help', () => {
  it('lists every shortcut and closes', () => {
    useStore.setState({ help: true })
    render(<Help />)
    for (const [key] of SHORTCUTS) expect(screen.getByText(key)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }))
    expect(screen.queryByText('Keys')).not.toBeInTheDocument()
  })
})

describe('TitleBlock', () => {
  const cell = (label: string) => screen.getByText(label).parentElement as HTMLElement

  it('shows the project, envelope and single part', () => {
    useStore.setState({
      bounds: [
        [0, 0, 0],
        [20, 10, 5],
      ],
    })
    render(<TitleBlock project={project()} />)
    expect(cell('Project')).toHaveTextContent('Box')
    expect(cell('Showing')).toHaveTextContent('DRAFT')
    expect(cell('Envelope')).toHaveTextContent('20.00 x 10.00 x 5.00')
    expect(cell('Part')).toHaveTextContent('main')
  })

  it('tells drafts, work in progress, tweaks and versions apart', () => {
    const { rerender } = render(<TitleBlock project={project({ versions: [version()] })} />)
    expect(cell('Showing')).toHaveTextContent('WIP')
    act(() => useStore.getState().setEdit('width', 30))
    expect(cell('Showing')).toHaveTextContent('TWEAK')
    act(() => useStore.setState({ versionId: 'v1', ghostId: 'v2' }))
    rerender(<TitleBlock project={project({ versions: [version()] })} />)
    expect(cell('Showing')).toHaveTextContent('v1')
    expect(cell('Overlay')).toHaveTextContent('v2')
  })

  it('names the selected set until it is tweaked', () => {
    useStore.setState({ activeSet: 'tray' })
    render(<TitleBlock project={project()} />)
    expect(cell('Showing')).toHaveTextContent('SET tray')
    act(() => useStore.getState().setEdit('width', 30))
    expect(cell('Showing')).toHaveTextContent('TWEAK')
  })

  it('shows assemblies and soloed parts', () => {
    const assembly = project({ parts: [partDef({ id: 'lid' }), partDef({ id: 'base' })] })
    render(<TitleBlock project={assembly} />)
    expect(cell('Part')).toHaveTextContent('ASSY')
    act(() => useStore.setState({ solo: 'lid' }))
    expect(cell('Part')).toHaveTextContent('lid')
  })
})

describe('ToolHint', () => {
  it('guides through the active tool', () => {
    render(<ToolHint />)
    expect(screen.queryByText(/pick/)).not.toBeInTheDocument()
    act(() => useStore.getState().setTool('measure'))
    expect(screen.getByText('pick the first point, vertices snap')).toBeInTheDocument()
    act(() => useStore.getState().addPoint([0, 0, 0]))
    expect(screen.getByText('pick the second point')).toBeInTheDocument()
    act(() => useStore.getState().setTool('annotate'))
    expect(screen.getByText('click a face, edge or corner to pin a note')).toBeInTheDocument()
    act(() => useStore.setState({ embed: true }))
    expect(screen.queryByText(/pin a note/)).not.toBeInTheDocument()
  })
})

describe('AnalysisLegend', () => {
  it('stays hidden without an analysis', () => {
    const { container } = render(<AnalysisLegend project={project()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('summarizes thin walls against the printer limits', () => {
    useStore.setState({ analysis: { mode: 'walls', busy: false, area: 12.5, extreme: 0.45 } })
    render(<AnalysisLegend project={project()} />)
    expect(screen.getByText('Wall thickness')).toBeInTheDocument()
    expect(screen.getByText('12.50 mm² under 0.80, min 0.45 mm')).toHaveClass('amber')
    expect(screen.getByText('pnpm scad check box')).toBeInTheDocument()
  })

  it('summarizes overhangs and the absence of them', () => {
    useStore.setState({ analysis: { mode: 'overhangs', busy: false, area: 40, extreme: 72 } })
    const { rerender } = render(<AnalysisLegend project={project()} />)
    expect(screen.getByText('Overhang from vertical')).toBeInTheDocument()
    expect(screen.getByText('40.00 mm², up to 72.00°')).toBeInTheDocument()
    act(() => useStore.setState({ analysis: { mode: 'overhangs', busy: false, area: 0, extreme: null } }))
    rerender(<AnalysisLegend project={project()} />)
    expect(screen.getByText('nothing past 45°')).toBeInTheDocument()
  })

  it('counts resin islands and shows progress', () => {
    useStore.setState({ analysis: { mode: 'islands', busy: false, area: 0, extreme: 2 } })
    const resin = project({ profile: resinProfile() })
    render(<AnalysisLegend project={resin} />)
    expect(screen.getByText('Islands')).toBeInTheDocument()
    expect(screen.getByText('2 islands need supports')).toBeInTheDocument()
    act(() => useStore.setState({ analysis: { mode: 'islands', busy: true, area: 0, extreme: null } }))
    expect(screen.getByText('measuring...')).toBeInTheDocument()
  })
})
