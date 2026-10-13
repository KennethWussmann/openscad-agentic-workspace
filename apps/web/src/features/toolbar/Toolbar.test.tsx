import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import { Toolbar } from './Toolbar.tsx'

const s = () => useStore.getState()
const tool = (label: string) => screen.getByRole('button', { name: new RegExp(`${label}$`) })

describe('Toolbar', () => {
  it('reflects and toggles display flags', () => {
    render(<Toolbar process="fdm" />)
    expect(tool('Edges')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(tool('X-ray'))
    expect(tool('X-ray')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(tool('Persp'))
    expect(tool('Ortho')).toHaveAttribute('aria-pressed', 'true')
    expect(s().display).toMatchObject({ xray: true, ortho: true })
  })

  it('names the overhang analysis after the print process', () => {
    const { rerender } = render(<Toolbar process="fdm" />)
    expect(tool('Overhang')).toBeInTheDocument()
    rerender(<Toolbar process="resin" />)
    expect(tool('Islands')).toBeInTheDocument()
  })

  it('switches measure and note tools and clears measurements', () => {
    render(<Toolbar process="fdm" />)
    fireEvent.click(tool('Measure'))
    expect(s().tool).toBe('measure')
    fireEvent.click(tool('Note'))
    expect(s().tool).toBe('annotate')
    fireEvent.click(tool('Note'))
    expect(s().tool).toBe('orbit')
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    act(() => {
      s().addPoint([0, 0, 0])
      s().addPoint([1, 0, 0])
    })
    fireEvent.click(tool('Clear'))
    expect(s().measures).toEqual([])
  })
})

describe('SectionPanel', () => {
  it('opens with the section tool and edits the cut', () => {
    useStore.setState({
      bounds: [
        [0, 0, 0],
        [20, 10, 5],
      ],
    })
    render(<Toolbar process="fdm" />)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    fireEvent.click(tool('Section'))
    const slider = screen.getByRole('slider', { name: /X = 0.00/ })
    expect(slider).toHaveAttribute('min', '-0.4')
    expect(slider).toHaveAttribute('max', '20.4')
    fireEvent.change(slider, { target: { value: '7.5' } })
    expect(s().section.offset).toBe(7.5)
    fireEvent.click(screen.getByRole('button', { name: 'Z' }))
    expect(screen.getByRole('slider', { name: /Z = 7.50/ })).toHaveAttribute('max', '5.1')
    fireEvent.click(screen.getByRole('button', { name: 'Flip kept side' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hatched caps' }))
    expect(s().section).toMatchObject({ axis: 'z', flip: true, caps: false })
  })

  it('offers move and rotate for a free plane', () => {
    useStore.setState({ section: { ...s().section, enabled: true } })
    render(<Toolbar process="fdm" />)
    fireEvent.click(screen.getByRole('button', { name: 'FREE' }))
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(s().section.gizmo).toBe('rotate')
  })
})
