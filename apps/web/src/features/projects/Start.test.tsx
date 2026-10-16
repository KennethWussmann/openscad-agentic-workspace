import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStore } from '../../store/store.ts'
import { summary } from '../../test/fixtures.ts'
import { Start } from './Start.tsx'

const bin = summary({ id: 'bin', name: 'Tool Bin', description: 'Holds screws', updated: 100, cover: 5, check: 'pass' })
const clip = summary({ id: 'clip', name: 'Zed Clip', description: '', updated: 300, status: 'error', proposal: true })

describe('Start', () => {
  it('guides an empty workspace', () => {
    render(<Start />)
    expect(screen.getByRole('heading', { name: /Nothing on the table/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows a card per project with cover, stats and flags', () => {
    useStore.setState({ projects: [bin, clip] })
    render(<Start />)
    expect(screen.getByRole('heading', { name: /On the bench/ })).toBeInTheDocument()
    const card = screen.getByRole('button', { name: /Tool Bin/ })
    expect(within(card).getByText('Holds screws')).toBeInTheDocument()
    expect(within(card).getByText('20 x 10 x 5')).toBeInTheDocument()
    expect(within(card).getByText('PASS')).toBeInTheDocument()
    expect(card.querySelector('img')?.getAttribute('src')).toContain('/projects/bin/file/preview/cover.png?v=5')
    const failed = screen.getByRole('button', { name: /Zed Clip/ })
    expect(within(failed).getByText('RENDER FAILED')).toBeInTheDocument()
    expect(within(failed).getByText('PROPOSAL')).toBeInTheDocument()
    expect(failed.querySelector('img')).toBeNull()
  })

  it('opens a project from its card', () => {
    useStore.setState({ projects: [bin] })
    render(<Start />)
    fireEvent.click(screen.getByRole('button', { name: /Tool Bin/ }))
    expect(useStore.getState().projectId).toBe('bin')
  })

  it('filters and sorts', () => {
    useStore.setState({ projects: [bin, clip] })
    render(<Start />)
    const names = () =>
      screen.getAllByRole('button', { name: /Tool Bin|Zed Clip/ }).map((b) => b.querySelector('strong')?.textContent)
    expect(names()).toEqual(['Zed Clip', 'Tool Bin'])
    fireEvent.click(screen.getByRole('button', { name: 'A-Z' }))
    expect(names()).toEqual(['Tool Bin', 'Zed Clip'])
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }))
    fireEvent.change(screen.getByLabelText('Filter projects'), { target: { value: 'screws' } })
    expect(names()).toEqual(['Tool Bin'])
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter projects'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No project matches/)).toBeInTheDocument()
  })
})
